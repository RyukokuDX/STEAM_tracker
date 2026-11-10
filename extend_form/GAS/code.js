// Code.gs（延長申請フォーム）

const scriptProperties = PropertiesService.getScriptProperties();

function getRequiredProperty(key) {
  const value = scriptProperties.getProperty(key);
  if (value === null || value === '') {
    throw new Error(`${key} script property is not set. Please set it in Project Settings > Script Properties.`);
  }
  return value;
}

const ACCESS_TOKEN = getRequiredProperty('ACCESS_TOKEN');
const USER_ID = getRequiredProperty('USER_ID');
const SPREAD_SHEET_ID = getRequiredProperty('SPREAD_SHEET_ID');
const SHEET_NAME_MANAGE = getRequiredProperty('SHEET_NAME_MANAGE');

const SPREAD_SHEET = SpreadsheetApp.openById(SPREAD_SHEET_ID);
const SHEET = SPREAD_SHEET.getSheetByName(SHEET_NAME_MANAGE);
if (!SHEET) {
  throw new Error(`シート "${SHEET_NAME_MANAGE}" が見つかりません。SHEET_NAME_MANAGE を "items" に設定してください。`);
}

// 列インデックス
const RESISTERED_AT = 0;
const EMAIL = 1;
const NAME = 2;
const ORGANIZATION = 3;
const PHOTO_FILE_ID = 4;
const HANDOVER_ON = 5;
const DAYS_UNTIL_HANDOVER = 6;
const STATUS = 7;
const ADMIN_NOTE = 8;

const DOMAIN = 'mail.ryukoku.ac.jp';
const LINE_WEBHOOK_TOKEN = scriptProperties.getProperty('LINE_WEBHOOK_TOKEN');
const STATUS_ACTIVE = 'active';
const DATE_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// 通知での氏名・団体名の表示形式を統一する（例: 山田太郎（○○サークル） / 山田太郎（団体名未入力））
function formatPerson(name, organ) {
  const org = String(organ || '').trim();
  return `${name}（${org || '団体名未入力'}）`;
}

// 表示用の日付形式（yyyy/MM/dd）に変換する。内部処理・postback では YYYY-MM-DD のまま扱う
function toDisplayDate(isoDate) {
  return String(isoDate || '').replace(/-/g, '/');
}

function isActiveStatus(status) {
  return String(status || '').trim().toLowerCase() === STATUS_ACTIVE;
}

// ============================================================
// doPost: 静的HTMLからのfetchとLINE Webhookを共用
// 判別方法:
//   - LINE Webhook → json.events が存在する
//   - 静的HTMLからのfetch → json.action が存在する
// ============================================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: 'error', message: 'POSTデータがありません' });
    }
    const json = JSON.parse(e.postData.contents);

    // LINE Webhookの場合
    if (json.events && Array.isArray(json.events)) {
      return handleLineWebhook(json, e);
    }

    // 静的HTMLからのfetchの場合
    if (json.action) {
      return handleFetchRequest(json);
    }

    return jsonResponse({ status: 'error', message: '不明なリクエストです' });

  } catch (err) {
    Logger.log('doPost エラー: ' + err);
    return jsonResponse({ status: 'error', message: String(err) });
  }
}

// ============================================================
// 静的HTMLからのfetchを処理
// ============================================================
function handleFetchRequest(payload) {
  const action = payload.action;
  let result;

  if (action === 'getItemsByEmail') {
    const items = getItemsByEmail(payload.email);
    result = { status: 'ok', items };

  } else if (action === 'notifyExtensionRequest') {
    result = notifyExtensionRequest(payload.email, payload.results);

  } else {
    result = { status: 'error', message: '不明なアクションです: ' + action };
  }

  return jsonResponse(result);
}

function parsePostbackData(rawData) {
  const params = {};
  String(rawData || '').split('&').forEach(pair => {
    if (!pair) return;
    const kv = pair.split('=');
    const key = decodeURIComponent(kv[0] || '');
    const value = decodeURIComponent(kv.slice(1).join('=') || '');
    if (key) params[key] = value;
  });
  return params;
}

function handleLineWebhook(json, e) {
  json.events.forEach(event => {
    if (!event || !event.source || event.source.userId !== USER_ID) {
      return;
    }

    if (event.type === 'postback' && event.postback && event.postback.data) {
      const params = parsePostbackData(event.postback.data);
      if (params.action !== 'approve' && params.action !== 'reject') {
        Logger.log('[line webhook] 不明な postback: ' + event.postback.data);
        return;
      }

      // 行番号(id)だけを含む旧形式のボタンは、行がずれて別の物品を更新する恐れがあるため処理しない
      if (!params.email || !params.reg) {
        Logger.log('[line webhook] 旧形式の postback のため処理しない: ' + event.postback.data);
        sendLineMessage(USER_ID, '古い形式の延長申請のため処理できませんでした。お手数ですが、利用者に延長申請フォームから再申請してもらってください。');
        return;
      }

      if (params.action === 'approve') {
        approveRequest(params.email, params.reg, params.date);
      } else {
        rejectRequest(params.email, params.reg);
      }
    }
  });

  return ContentService
    .createTextOutput('OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ============================================================
// CORSヘッダー付きJSONレスポンスを返す
// ============================================================
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// HTMLフォーム表示（GAS Webアプリとして直接開く場合用・現在未使用）
// ============================================================
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("延長申請フォーム")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// 物品の特定（メールアドレス + 登録日時）
// 行番号は、ダッシュボードでのアーカイブ・削除で変わるため識別子に使わない。
// 登録日時（A列）は秒単位で比較する。
// ============================================================
function registeredAtKey(value) {
  if (value instanceof Date) return String(Math.floor(value.getTime() / 1000));
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : String(Math.floor(d.getTime() / 1000));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// 該当行を探す。戻り値: { status: 'found', row } / { status: 'notFound' } / { status: 'multiple' }
// row は getValues() の配列インデックス（シートの行番号 - 1）
function findItemRow(data, email, reg) {
  const targetEmail = normalizeEmail(email);
  const targetReg = String(reg || '');
  if (!targetEmail || !targetReg) return { status: 'notFound' };

  const matches = [];
  for (let i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][EMAIL]) === targetEmail && registeredAtKey(data[i][RESISTERED_AT]) === targetReg) {
      matches.push(i);
    }
  }
  if (matches.length === 0) return { status: 'notFound' };
  if (matches.length > 1) return { status: 'multiple' };
  return { status: 'found', row: matches[0] };
}

// 日付（YYYY-MM-DD）関連のユーティリティ（日本時間基準）
function toIsoDate(value) {
  return Utilities.formatDate(new Date(value), 'Asia/Tokyo', 'yyyy-MM-dd');
}

// YYYY-MM-DD が属する年度の末日（3月31日）を YYYY-MM-DD で返す
function fiscalYearEndIso(isoDate) {
  const [y, m] = isoDate.split('-').map(Number);
  return `${m >= 4 ? y + 1 : y}-03-31`;
}

function addDaysIso(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const pad = n => (n < 10 ? '0' + n : String(n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// 延長希望日の検証。問題なければ null、問題があれば理由を返す
function validateNewDate(newDate, currentHandoverIso) {
  if (!DATE_ISO_REGEX.test(String(newDate || ''))) return '日付の形式が正しくありません';
  if (newDate === currentHandoverIso) return '現在の明け渡し日から変更されていません';
  const tomorrow = addDaysIso(toIsoDate(new Date()), 1);
  if (newDate < tomorrow) return `明日（${toDisplayDate(tomorrow)}）以降の日付を選択してください`;
  const maxDate = fiscalYearEndIso(currentHandoverIso);
  if (newDate > maxDate) return `年度末（${toDisplayDate(maxDate)}）までの日付を選択してください`;
  return null;
}

// ============================================================
// メールアドレスをもとに物品を取得
// ============================================================
function getItemsByEmail(email) {
  const data = SHEET.getDataRange().getValues();
  const results = [];

  for (let i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][EMAIL]) === normalizeEmail(email) && isActiveStatus(data[i][STATUS])) {
      results.push({
        reg: registeredAtKey(data[i][RESISTERED_AT]),
        name: data[i][NAME],
        organ: data[i][ORGANIZATION],
        handover: toIsoDate(data[i][HANDOVER_ON]),
        maxDate: fiscalYearEndIso(toIsoDate(data[i][HANDOVER_ON])),
        image: `https://lh3.googleusercontent.com/d/${data[i][PHOTO_FILE_ID]}`
      });
    }
  }

  return results;
}

// ============================================================
// 延長申請をLINEに送信
// email: 申請者のメールアドレス, results: [{ reg, newDate }]
// 戻り値: { status, message, sent, skipped: [{ name, reason }] }
// ============================================================
function notifyExtensionRequest(email, results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { status: 'error', message: '延長したい物品の日付を変更してください。' };
  }

  const data = SHEET.getDataRange().getValues();
  let sent = 0;
  const skipped = [];

  results.forEach(item => {
    const found = findItemRow(data, email, item && item.reg);
    if (found.status !== 'found') {
      Logger.log(`[notifyExtensionRequest] 物品を特定できない: email=${email} reg=${item && item.reg} status=${found.status}`);
      skipped.push({ name: '', reason: '対象の物品が見つかりませんでした。画面を開き直してください' });
      return;
    }
    const row = data[found.row];
    const name = row[NAME];
    const organ = row[ORGANIZATION];
    if (!isActiveStatus(row[STATUS])) {
      Logger.log(`[notifyExtensionRequest] 非activeレコードのためスキップ: row=${found.row + 1} status=${row[STATUS]}`);
      skipped.push({ name, reason: '延長申請の対象外の物品です' });
      return;
    }

    const newDate = String(item.newDate || '');
    const error = validateNewDate(newDate, toIsoDate(row[HANDOVER_ON]));
    if (error) {
      Logger.log(`[notifyExtensionRequest] 日付が不正: row=${found.row + 1} newDate=${newDate} reason=${error}`);
      skipped.push({ name, reason: error });
      return;
    }

    const reg = registeredAtKey(row[RESISTERED_AT]);
    const keyParams = `email=${encodeURIComponent(normalizeEmail(row[EMAIL]))}&reg=${reg}`;
    const payload = {
      to: USER_ID,
      messages: [
        {
          type: "flex",
          altText: "延長申請があります",
          contents: {
            type: "bubble",
            hero: {
              type: "image",
              url: `https://lh3.googleusercontent.com/d/${row[PHOTO_FILE_ID]}`,
              size: "full",
              aspectRatio: "20:13",
              aspectMode: "cover"
            },
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: "延長申請", weight: "bold", size: "xl" },
                { type: "text", text: formatPerson(name, organ), size: "md", wrap: true, margin: "md" },
                { type: "text", text: `明け渡し日：${toDisplayDate(toIsoDate(row[HANDOVER_ON]))}`, size: "md", wrap: true, margin: "md" },
                { type: "text", text: `希望延長日：${toDisplayDate(newDate)}`, size: "md", wrap: true, margin: "sm" }
              ]
            },
            footer: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: [
                {
                  type: "button",
                  style: "primary",
                  color: "#00AA00",
                  action: {
                    type: "postback",
                    label: "許可",
                    data: `action=approve&${keyParams}&date=${newDate}`
                  }
                },
                {
                  type: "button",
                  style: "secondary",
                  color: "#FF0000",
                  action: {
                    type: "postback",
                    label: "却下",
                    data: `action=reject&${keyParams}`
                  }
                }
              ]
            }
          }
        }
      ]
    };

    const lineResult = sendLinePushObject(payload);
    if (lineResult.success) {
      sent++;
    } else {
      skipped.push({ name, reason: '管理者への通知に失敗しました。時間をおいて再度お試しください' });
    }
  });

  if (sent === 0) {
    const reasons = skipped.map(s => (s.name ? `${s.name}: ` : '') + s.reason).join('\n');
    return { status: 'error', message: reasons || '申請できる物品がありませんでした。', sent, skipped };
  }
  return { status: 'ok', sent, skipped };
}

// ============================================================
// 許可/却下の対象行を特定する（見つからない場合は管理者へLINEで知らせる）
// ============================================================
function resolveRowForDecision(email, reg, actionLabel) {
  const data = SHEET.getDataRange().getValues();
  const found = findItemRow(data, email, reg);
  if (found.status === 'notFound') {
    Logger.log(`[${actionLabel}] 対象の物品が見つからない: email=${email} reg=${reg}`);
    sendLineMessage(USER_ID, `延長申請を${actionLabel}できませんでした。対象の物品が見つかりません（アーカイブ・削除済み、またはメールアドレス・登録日時が変更された可能性があります）。`);
    return null;
  }
  if (found.status === 'multiple') {
    Logger.log(`[${actionLabel}] 対象の物品が複数見つかった: email=${email} reg=${reg}`);
    sendLineMessage(USER_ID, `延長申請を${actionLabel}できませんでした。同じメールアドレス・登録日時の物品が複数あります。スプレッドシートを確認してください。`);
    return null;
  }
  const row = data[found.row];
  if (!isActiveStatus(row[STATUS])) {
    Logger.log(`[${actionLabel}] 非activeレコードのためスキップ: row=${found.row + 1} status=${row[STATUS]}`);
    sendLineMessage(USER_ID, `${formatPerson(row[NAME], row[ORGANIZATION])}の延長申請を${actionLabel}できませんでした。この物品はすでにアーカイブされています。`);
    return null;
  }
  return { rowIndex: found.row, row };
}

// ============================================================
// 延長申請の許可
// ============================================================
function approveRequest(email, reg, newDate) {
  if (!DATE_ISO_REGEX.test(String(newDate || ''))) {
    Logger.log(`無効な日付形式: ${newDate}`);
    return;
  }
  const target = resolveRowForDecision(email, reg, '許可');
  if (!target) return;

  const { rowIndex, row } = target;
  const name = row[NAME];
  const organ = row[ORGANIZATION];
  const person = formatPerson(name, organ);

  // ボタンの二度押しなどで、すでに同じ日付になっている場合は再送しない
  if (toIsoDate(row[HANDOVER_ON]) === newDate) {
    sendLineMessage(USER_ID, `${person}の明け渡し日は、すでに ${toDisplayDate(newDate)} に更新済みです。`);
    return;
  }

  SHEET.getRange(rowIndex + 1, HANDOVER_ON + 1).setValue(newDate);
  const mailResult = sendEmail(row[EMAIL],
    'STEAMコモンズ 延長申請許可通知',
    `${name}さん${organ ? `（${organ}）` : ''}\n\n延長申請が許可されました。\n新しい明け渡し日: ${toDisplayDate(newDate)}\n\nこのメッセージに心当たりがない場合は、STEAMコモンズまでお越しください。`
  );
  const mailNote = mailResult.success ? '' : `\n（メール送信に失敗しました。${mailResult.message}）`;
  sendLineMessage(USER_ID, `${person}の延長申請を ${toDisplayDate(newDate)} まで許可しました。${mailNote}`);
}

// ============================================================
// 延長申請の却下
// ============================================================
function rejectRequest(email, reg) {
  const target = resolveRowForDecision(email, reg, '却下');
  if (!target) return;

  const { row } = target;
  const name = row[NAME];
  const organ = row[ORGANIZATION];

  const mailResult = sendEmail(row[EMAIL],
    'STEAMコモンズ 延長申請却下通知',
    `${name}さん${organ ? `（${organ}）` : ''}\n\n延長申請が却下されました。\n\nこのメッセージに心当たりがない場合は、STEAMコモンズまでお越しください。`
  );
  const mailNote = mailResult.success ? '' : `\n（メール送信に失敗しました。${mailResult.message}）`;
  sendLineMessage(USER_ID, `${formatPerson(name, organ)}の延長申請を却下しました。${mailNote}`);
}

// ============================================================
// メール送信
// ============================================================
function sendEmail(to, subject, body) {
  try {
    if (!to || !subject || !body) throw new Error("送信先、件名、本文のいずれかが空です。");
    GmailApp.sendEmail(to, subject, body);
    Logger.log(`メール送信成功: ${to}`);
    return { success: true, message: "" };
  } catch (error) {
    Logger.log(`メール送信失敗: ${to}\n理由: ${error.message}`);
    return { success: false, message: error.message };
  }
}

// ============================================================
// LINE テキストメッセージ送信
// ============================================================
function sendLineMessage(to, text) {
  return sendLinePushObject({
    to,
    messages: [{ type: 'text', text }]
  });
}

// ============================================================
// LINE オブジェクト送信（ステータスコード検査 + リトライ）
// 最大3回、指数バックオフ（1秒→2秒→4秒）。4xx はリトライせず即時失敗。
// ============================================================
function sendLinePushObject(payload) {
  const url = "https://api.line.me/v2/bot/message/push";
  const options = {
    method: "post",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Authorization": "Bearer " + ACCESS_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const MAX_ATTEMPTS = 3;
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = UrlFetchApp.fetch(url, options);
      const statusCode = res.getResponseCode();
      const body = res.getContentText();
      if (statusCode >= 200 && statusCode < 300) {
        Logger.log(`LINE送信成功 (試行${attempt}): ${body}`);
        return { success: true, message: '' };
      }
      lastError = `HTTP ${statusCode}: ${body}`;
      Logger.log(`LINE送信失敗 (試行${attempt}): ${lastError}`);
      if (statusCode >= 400 && statusCode < 500) {
        return { success: false, message: lastError };
      }
    } catch (e) {
      lastError = String(e);
      Logger.log(`LINE送信失敗 (試行${attempt}): ${lastError}`);
    }
    if (attempt < MAX_ATTEMPTS) {
      Utilities.sleep(Math.pow(2, attempt - 1) * 1000);
    }
  }
  return { success: false, message: lastError };
}

// ============================================================
// 権限取得用（初回実行時に使用）
// ============================================================
function requestGmailPermission() {
  GmailApp.sendEmail(Session.getActiveUser().getEmail(), "権限テスト", "これは権限確認用のテストです");
}
