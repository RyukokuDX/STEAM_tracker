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

// ============================================================
// Webhook の送信元確認
// LINE Developers に登録する Webhook URL の末尾に ?token=... を付け、
// スクリプトプロパティ LINE_WEBHOOK_TOKEN と一致するリクエストだけを LINE からのものとして扱う。
// （GAS の doPost ではリクエストヘッダーを読めず、LINE 標準の署名検証ができないため）
// ============================================================
const WEBHOOK_TOKEN_KEY = 'LINE_WEBHOOK_TOKEN';

function isValidWebhookToken(e) {
  const expected = scriptProperties.getProperty(WEBHOOK_TOKEN_KEY);
  if (!expected) {
    Logger.log(`[line webhook] ${WEBHOOK_TOKEN_KEY} が未設定のため Webhook を受け付けない。setupWebhookToken() を実行してください。`);
    return false;
  }
  const token = String((e && e.parameter && e.parameter.token) || '');
  return token === expected;
}

// Webhook 用のトークンを作成し、LINE Developers に設定する URL の末尾をログに出す
// （初回のみ Apps Script エディタから手動実行。既にあれば作り直さずに表示だけする）
function setupWebhookToken() {
  let token = scriptProperties.getProperty(WEBHOOK_TOKEN_KEY);
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    scriptProperties.setProperty(WEBHOOK_TOKEN_KEY, token);
    Logger.log(`[setupWebhookToken] ${WEBHOOK_TOKEN_KEY} を作成しました。`);
  } else {
    Logger.log(`[setupWebhookToken] ${WEBHOOK_TOKEN_KEY} は設定済みです。`);
  }
  Logger.log(`LINE Developers の Webhook URL を「（このWebアプリの /exec で終わるURL）?token=${token}」に変更してください。`);
}

function handleLineWebhook(json, e) {
  if (!isValidWebhookToken(e)) {
    Logger.log('[line webhook] トークンが一致しないため処理しない');
    // LINE に再送させないよう 200 を返す
    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  }

  json.events.forEach(event => {
    if (!event || !event.source || event.source.userId !== USER_ID) {
      return;
    }

    if (event.type === 'postback' && event.postback && event.postback.data) {
      handlePostback(event.postback.data);
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
  if (value === '' || value === null || value === undefined) return '';
  const d = value instanceof Date ? value : new Date(value);
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

// ============================================================
// 日付（YYYY-MM-DD、日本時間基準）
// ============================================================
// 読み取れない値は '' を返す（1行の不備で一覧全体がエラーにならないようにする）
function toIsoDate(value) {
  if (value === '' || value === null || value === undefined) return '';
  const d = value instanceof Date ? value : new Date(String(value).replace(/-/g, '/'));
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
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

// 物品ごとに、延長申請できるか・選べる日付の範囲を求める。
// 選べるのは「明日以降かつ現在の明け渡し日より後」から「明け渡し日が属する年度の末日」まで。
// 年度末を越える延長はできない（docs/REQUIREMENTS.md の設置期間の原則）。
function extensionRange(reg, handoverIso) {
  if (!reg) {
    return { canExtend: false, reason: '登録日時が不明なため申請できません。STEAMコモンズの管理者にお問い合わせください' };
  }
  if (!handoverIso) {
    return { canExtend: false, reason: '明け渡し日が不明なため申請できません。STEAMコモンズの管理者にお問い合わせください' };
  }
  const tomorrow = addDaysIso(toIsoDate(new Date()), 1);
  const dayAfterHandover = addDaysIso(handoverIso, 1);
  const minDate = tomorrow > dayAfterHandover ? tomorrow : dayAfterHandover;
  const maxDate = fiscalYearEndIso(handoverIso);
  if (minDate > maxDate) {
    return { canExtend: false, minDate, maxDate, reason: `年度末（${toDisplayDate(maxDate)}）を過ぎる延長はできません。期限までに撤去するか、STEAMコモンズの管理者にご相談ください` };
  }
  return { canExtend: true, minDate, maxDate };
}

// YYYY-MM-DD の形式で、かつ実在する日付か（2027-02-30 などを除外する）
function isRealIsoDate(value) {
  const text = String(value || '');
  if (!DATE_ISO_REGEX.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// 延長希望日の検証。問題なければ null、問題があれば理由を返す
function validateNewDate(newDate, reg, currentHandoverIso) {
  if (!isRealIsoDate(newDate)) return '日付が正しくありません';
  if (newDate === currentHandoverIso) return '現在の明け渡し日から変更されていません';
  const range = extensionRange(reg, currentHandoverIso);
  if (!range.canExtend) return range.reason;
  if (newDate < range.minDate || newDate > range.maxDate) {
    return `${toDisplayDate(range.minDate)} から ${toDisplayDate(range.maxDate)} までの日付を選択してください`;
  }
  return null;
}

// ============================================================
// 許可/却下ボタンの署名
// GAS の doPost ではリクエストヘッダーを読めず LINE 標準の署名検証ができないため、
// ボタンの postback データに HMAC 署名を入れ、押されたときに検証する。
// 鍵はスクリプトプロパティ POSTBACK_SIGNING_SECRET（setupPostbackSecret で作成）。
// ============================================================
const POSTBACK_SECRET_KEY = 'POSTBACK_SIGNING_SECRET';

function getPostbackSecret() {
  const secret = scriptProperties.getProperty(POSTBACK_SECRET_KEY);
  if (!secret) {
    throw new Error(`${POSTBACK_SECRET_KEY} script property is not set. Run setupPostbackSecret() in the Apps Script editor.`);
  }
  return secret;
}

// fields: { action, email, reg, cur, date }（cur は申請時点の明け渡し日、date は希望延長日）
function signPostback(fields) {
  const base = [fields.action, fields.email, fields.reg, fields.cur, fields.date].join('|');
  const bytes = Utilities.computeHmacSha256Signature(base, getPostbackSecret());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function buildPostbackData(fields) {
  const parts = [
    `action=${fields.action}`,
    `email=${encodeURIComponent(fields.email)}`,
    `reg=${fields.reg}`,
    `cur=${fields.cur}`,
    `date=${fields.date}`,
    `sig=${signPostback(fields)}`
  ];
  return parts.join('&');
}

// 署名用の鍵を作成する（初回のみ Apps Script エディタから手動実行。既にあれば何もしない）
function setupPostbackSecret() {
  if (scriptProperties.getProperty(POSTBACK_SECRET_KEY)) {
    Logger.log(`[setupPostbackSecret] ${POSTBACK_SECRET_KEY} は設定済みです。`);
    return;
  }
  const secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  scriptProperties.setProperty(POSTBACK_SECRET_KEY, secret);
  Logger.log(`[setupPostbackSecret] ${POSTBACK_SECRET_KEY} を作成しました。`);
}

// ============================================================
// 処理済みの申請の記録（ボタンの二度押し対策）
// スクリプトプロパティ EXTENSION_DECISIONS に { 申請キー: { a: 'approve'|'reject', d: 希望延長日 } } を
// JSON で保存する（最初の記録時に自動で作成される）。
// 希望延長日を過ぎた申請はボタンが効かなくなるため、その記録は自動で削除する。
// ============================================================
const DECISIONS_KEY = 'EXTENSION_DECISIONS';

// 申請キー: 物品（メールアドレス+登録日時）+ 申請時点の明け渡し日 + 希望延長日 のハッシュ
function decisionKey(fields) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    [fields.email, fields.reg, fields.cur, fields.date].join('|'), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '').slice(0, 22);
}

function loadDecisions() {
  try {
    return JSON.parse(scriptProperties.getProperty(DECISIONS_KEY) || '{}');
  } catch (err) {
    Logger.log(`[decisions] ${DECISIONS_KEY} を読み取れないため空として扱う: ${err}`);
    return {};
  }
}

function recordDecision(fields) {
  const today = toIsoDate(new Date());
  const all = loadDecisions();
  Object.keys(all).forEach(key => {
    if (!all[key] || !all[key].d || all[key].d <= today) delete all[key];
  });
  all[decisionKey(fields)] = { a: fields.action, d: fields.date };
  scriptProperties.setProperty(DECISIONS_KEY, JSON.stringify(all));
}

// 許可/却下の前に、申請が期限切れでないか・処理済みでないかを確認する。
// 処理してよければ true。そうでなければ管理者へ LINE で知らせて false
function checkRequestState(fields, person) {
  const today = toIsoDate(new Date());
  if (fields.date <= today) {
    sendLineMessage(USER_ID, `${person}の延長申請（希望延長日 ${toDisplayDate(fields.date)}）は、希望延長日を過ぎているため処理できません。必要であれば、利用者に再申請してもらってください。`);
    return false;
  }
  const decided = loadDecisions()[decisionKey(fields)];
  if (decided) {
    sendLineMessage(USER_ID, `${person}の延長申請（希望延長日 ${toDisplayDate(fields.date)}）は、すでに${decided.a === 'approve' ? '許可' : '却下'}済みです。`);
    return false;
  }
  return true;
}

// LINE の postback（許可/却下ボタン）を処理する
function handlePostback(rawData) {
  const params = parsePostbackData(rawData);
  if (params.action !== 'approve' && params.action !== 'reject') {
    Logger.log('[postback] 不明な postback: ' + rawData);
    return;
  }

  // 署名の無いボタン（行番号だけの旧形式、または署名導入前の形式）は処理しない
  if (!params.sig) {
    Logger.log('[postback] 旧形式の postback のため処理しない: ' + rawData);
    sendLineMessage(USER_ID, '古い形式の延長申請のため処理できませんでした。お手数ですが、利用者に延長申請フォームから再申請してもらってください。');
    return;
  }

  const fields = {
    action: params.action,
    email: normalizeEmail(params.email),
    reg: String(params.reg || ''),
    cur: String(params.cur || ''),
    date: String(params.date || '')
  };
  let expected;
  try {
    expected = signPostback(fields);
  } catch (err) {
    Logger.log('[postback] 署名を検証できない: ' + err);
    return;
  }
  if (expected !== params.sig) {
    // 偽装された可能性があるため、何もせずログだけ残す
    Logger.log('[postback] 署名が一致しないため処理しない: ' + rawData);
    return;
  }
  if (!isRealIsoDate(fields.date)) {
    Logger.log('[postback] 希望延長日が不正なため処理しない: ' + rawData);
    return;
  }

  // 二度押しなどで同時に処理されないよう排他制御する
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    sendLineMessage(USER_ID, '処理が混み合っているため、延長申請を処理できませんでした。少し待ってから、もう一度ボタンを押してください。');
    return;
  }
  try {
    if (fields.action === 'approve') {
      approveRequest(fields);
    } else {
      rejectRequest(fields);
    }
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// メールアドレスをもとに物品を取得
// ============================================================
function getItemsByEmail(email) {
  const data = SHEET.getDataRange().getValues();
  const results = [];

  for (let i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][EMAIL]) === normalizeEmail(email) && isActiveStatus(data[i][STATUS])) {
      const reg = registeredAtKey(data[i][RESISTERED_AT]);
      const handover = toIsoDate(data[i][HANDOVER_ON]);
      const range = extensionRange(reg, handover);
      results.push({
        reg,
        name: data[i][NAME],
        organ: data[i][ORGANIZATION],
        handover,
        canExtend: range.canExtend,
        reason: range.reason || '',
        minDate: range.minDate || '',
        maxDate: range.maxDate || '',
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
  try {
    getPostbackSecret();
  } catch (err) {
    Logger.log('[notifyExtensionRequest] ' + err);
    return { status: 'error', message: '現在、延長申請を受け付けられません。STEAMコモンズの管理者にお問い合わせください。' };
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

    const reg = registeredAtKey(row[RESISTERED_AT]);
    const cur = toIsoDate(row[HANDOVER_ON]);
    const newDate = String(item.newDate || '');
    const error = validateNewDate(newDate, reg, cur);
    if (error) {
      Logger.log(`[notifyExtensionRequest] 日付が不正: row=${found.row + 1} newDate=${newDate} reason=${error}`);
      skipped.push({ name, reason: error });
      return;
    }

    const keyFields = { email: normalizeEmail(row[EMAIL]), reg, cur };
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
                { type: "text", text: `明け渡し日：${toDisplayDate(cur)}`, size: "md", wrap: true, margin: "md" },
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
                    data: buildPostbackData(Object.assign({ action: 'approve', date: newDate }, keyFields))
                  }
                },
                {
                  type: "button",
                  style: "secondary",
                  color: "#FF0000",
                  action: {
                    type: "postback",
                    label: "却下",
                    data: buildPostbackData(Object.assign({ action: 'reject', date: newDate }, keyFields))
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
// fields: { email, reg, cur（申請時点の明け渡し日）, date（希望延長日） }
// ============================================================
function approveRequest(fields) {
  const newDate = fields.date;
  const target = resolveRowForDecision(fields.email, fields.reg, '許可');
  if (!target) return;

  const { rowIndex, row } = target;
  const name = row[NAME];
  const organ = row[ORGANIZATION];
  const person = formatPerson(name, organ);
  if (!checkRequestState(fields, person)) return;

  const currentIso = toIsoDate(row[HANDOVER_ON]);
  // 記録が無くても、すでに同じ日付になっている場合は再送しない
  if (currentIso === newDate) {
    sendLineMessage(USER_ID, `${person}の明け渡し日は、すでに ${toDisplayDate(newDate)} に更新済みです。`);
    return;
  }
  // 申請後に明け渡し日が変わっている（別の申請を許可済みなど）場合は処理しない
  if (currentIso !== fields.cur) {
    sendLineMessage(USER_ID, `${person}の延長申請を許可できませんでした。申請後に明け渡し日が変更されています（現在 ${toDisplayDate(currentIso) || '不明'}）。`);
    return;
  }
  // 許可の時点でも日付の範囲を確認する
  const error = validateNewDate(newDate, fields.reg, currentIso);
  if (error) {
    sendLineMessage(USER_ID, `${person}の延長申請（希望延長日 ${toDisplayDate(newDate)}）を許可できませんでした。${error}。お手数ですが、利用者に再申請してもらってください。`);
    return;
  }

  SHEET.getRange(rowIndex + 1, HANDOVER_ON + 1).setValue(newDate);
  recordDecision(fields);
  const mailResult = sendEmail(row[EMAIL],
    'STEAMコモンズ 延長申請許可通知',
    `${name}さん${organ ? `（${organ}）` : ''}\n\n延長申請が許可されました。\n新しい明け渡し日: ${toDisplayDate(newDate)}\n\nこのメッセージに心当たりがない場合は、STEAMコモンズまでお越しください。`
  );
  const mailNote = mailResult.success ? '' : `\n（メール送信に失敗しました。${mailResult.message}）`;
  sendLineMessage(USER_ID, `${person}の延長申請を ${toDisplayDate(newDate)} まで許可しました。${mailNote}`);
}

// ============================================================
// 延長申請の却下
// fields: { email, reg, cur（申請時点の明け渡し日）, date（希望延長日） }
// ============================================================
function rejectRequest(fields) {
  const target = resolveRowForDecision(fields.email, fields.reg, '却下');
  if (!target) return;

  const { row } = target;
  const name = row[NAME];
  const organ = row[ORGANIZATION];
  const person = formatPerson(name, organ);
  if (!checkRequestState(fields, person)) return;

  const currentIso = toIsoDate(row[HANDOVER_ON]);
  // 申請後に明け渡し日が変わっている（許可済みなど）場合は、矛盾したメールを送らない
  if (currentIso !== fields.cur) {
    sendLineMessage(USER_ID, `${person}の延長申請を却下しませんでした。申請後に明け渡し日が変更されています（現在 ${toDisplayDate(currentIso) || '不明'}）。すでに許可済みの可能性があります。`);
    return;
  }

  recordDecision(fields);
  const mailResult = sendEmail(row[EMAIL],
    'STEAMコモンズ 延長申請却下通知',
    `${name}さん${organ ? `（${organ}）` : ''}\n\n延長申請が却下されました。\n\nこのメッセージに心当たりがない場合は、STEAMコモンズまでお越しください。`
  );
  const mailNote = mailResult.success ? '' : `\n（メール送信に失敗しました。${mailResult.message}）`;
  sendLineMessage(USER_ID, `${person}の延長申請を却下しました。${mailNote}`);
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
