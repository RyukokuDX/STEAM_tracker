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
const EXTEND_FORM_URL = getRequiredProperty('EXTEND_FORM_URL'); // 延長申請フォームのURL（stuffForm と同じキー名）
const SPREAD_SHEET_ID = getRequiredProperty('SPREAD_SHEET_ID');
const SHEET_NAME_MANAGE = getRequiredProperty('SHEET_NAME_MANAGE');

const SPREAD_SHEET = SpreadsheetApp.openById(SPREAD_SHEET_ID);
const SHEET = SPREAD_SHEET.getSheetByName(SHEET_NAME_MANAGE);
if (!SHEET) {
  throw new Error(`シート "${SHEET_NAME_MANAGE}" が見つかりません。SHEET_NAME_MANAGE を "items" に設定してください。`);
}

// 新規登録通知専用のWebhook
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      Logger.log('[line_bot doPost] POSTデータなし');
      return jsonResponse({ status: 'error', message: 'POSTデータがありません。' });
    }

    const payload = JSON.parse(e.postData.contents);
    Logger.log('[line_bot doPost] action=' + payload.action + ' payload=' + JSON.stringify(payload));
    if (payload.action !== 'notifyRegistration') {
      Logger.log('[line_bot doPost] 不明アクション: ' + payload.action);
      return jsonResponse({ status: 'error', message: '不明なアクションです。' });
    }

    const result = registerNotify(payload.data || payload);
    Logger.log('[line_bot doPost] result=' + JSON.stringify(result));
    return jsonResponse(result);
  } catch (err) {
    Logger.log('doPost エラー: ' + err);
    return jsonResponse({ status: 'error', message: String(err) });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// 列要素
const REGISTERED_AT = 0;        // フォーム送信時刻（自動記録）
const EMAIL = 1;                // 登録者メール
const NAME = 2;                 // 登録者氏名
const ORGANIZATION = 3;         // 団体名
const PHOTO_FILE_ID = 4;        // Drive ファイル ID
const HANDOVER_ON = 5;          // 明け渡し日（YYYY-MM-DD）
const DAYS_UNTIL_HANDOVER = 6;  // 旧仕様の残り日数列（現在は未使用。残り日数は HANDOVER_ON から算出する）
const STATUS = 7;               // active / archived / pending
const ADMIN_NOTE = 8;           // 管理者備考
const STATUS_ACTIVE = 'active';

function isActiveStatus(status) {
  return String(status || '').trim().toLowerCase() === STATUS_ACTIVE;
}

const REMIND_DAYS = [3, 0];          // リマインド対象とする残り日数（期限前・当日）
const OVERDUE_LIST_LIMIT = 30;       // 管理者向け期限超過まとめLINEに列挙する最大件数
const REMIND_TRIGGER_HOUR = 9;      // 日次トリガーの実行時刻（9〜10時の間に実行される）
const REMIND_FUNCTION_NAME = 'handoverDayRemind';
const REMIND_TIMEZONE = 'Asia/Tokyo';     // 残り日数の算出・トリガー実行時刻の基準
// Gmail の1日の送信上限に達したときのエラーメッセージ
const MAIL_QUOTA_ERROR_REGEX = /too many times|quota|上限/i;

// 明け渡し日（F列）の値を Date にする。読み取れない場合は null
function parseHandoverDate(value) {
  if (value === '' || value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value).replace(/-/g, '/'));
  return isNaN(date.getTime()) ? null : date;
}

// 日付を日本時間の YYYY-MM-DD にする。スプレッドシートやプロジェクトのタイムゾーン設定が
// 日本以外になっていても、通知日や表示がずれないよう日本時間に固定する。
function toIsoDate(date) {
  return Utilities.formatDate(date, REMIND_TIMEZONE, 'yyyy-MM-dd');
}

function isoToDayNumber(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

// 明け渡し日（F列）から、今日を基準にした残り日数を算出する。読み取れない場合は null
function calcDaysUntilHandover(handoverOn, today) {
  const date = parseHandoverDate(handoverOn);
  if (!date) return null;
  return isoToDayNumber(toIsoDate(date)) - isoToDayNumber(toIsoDate(today));
}

// 明け渡し日を表示用の文字列（yyyy/MM/dd）にする
function formatHandoverOn(handoverOn) {
  const date = parseHandoverDate(handoverOn);
  return date ? toIsoDate(date).replace(/-/g, '/') : String(handoverOn);
}

// 延長申請できるかどうか（extend_form と同じ規則）。
// 延長できるのは「明日以降かつ現在の明け渡し日より後」から「明け渡し日が属する年度の末日」まで。
// 年度末を越える延長はできない（docs/REQUIREMENTS.md の設置期間の原則）。
function canExtendHandover(handoverOn, today) {
  const date = parseHandoverDate(handoverOn);
  if (!date) return { canExtend: false, fiscalYearEnd: '' };
  const handoverIso = toIsoDate(date);
  const [y, m] = handoverIso.split('-').map(Number);
  const fiscalYearEnd = `${m >= 4 ? y + 1 : y}-03-31`;
  const minDay = Math.max(isoToDayNumber(toIsoDate(today)), isoToDayNumber(handoverIso)) + 1;
  return { canExtend: minDay <= isoToDayNumber(fiscalYearEnd), fiscalYearEnd: fiscalYearEnd.replace(/-/g, '/') };
}

// 通知での氏名・団体名の表示形式を統一する（例: 山田太郎（○○サークル） / 山田太郎（団体名未入力））
function formatPerson(name, organ) {
  const org = String(organ || '').trim();
  return `${name}（${org || '団体名未入力'}）`;
}

// 利用者向けリマインドメールの本文を作る（kind: 'before3' / 'today' / 'overdue'）
function buildReminderMailBody(kind, name, handoverOn, daysDiff, today) {
  const { canExtend, fiscalYearEnd } = canExtendHandover(handoverOn, today);
  const footer = '\n\nこのメッセージに心当たりが無い場合は、STEAMコモンズまでお越しください。';
  if (kind === 'before3') {
    return `${name}さん。物品の明け渡し3日前となりました。\n` + (canExtend
      ? `3日以内に物品の撤去、又は以下のURLから延長申請を行ってください。\n${EXTEND_FORM_URL}`
      : `年度末（${fiscalYearEnd}）を過ぎる延長はできないため、3日以内に物品を撤去してください。`) + footer;
  }
  if (kind === 'today') {
    return `${name}さん。明け渡し当日となりました。\n` + (canExtend
      ? `本日中に物品の撤去、又は以下のURLから延長申請を行ってください。\n${EXTEND_FORM_URL}`
      : `年度末（${fiscalYearEnd}）を過ぎる延長はできないため、本日中に物品を撤去してください。`) + footer;
  }
  return `${name}さん。物品の明け渡し日（${formatHandoverOn(handoverOn)}）を${-daysDiff}日過ぎています。\n` + (canExtend
    ? `至急物品を撤去してください。延長を希望する場合は、以下のURLから延長申請を行ってください。\n${EXTEND_FORM_URL}`
    : `年度末（${fiscalYearEnd}）を過ぎているため延長申請はできません。至急物品を撤去してください。`) +
    '\n\n撤去済みの場合は、STEAMコモンズの管理者にお知らせください。' + footer.replace('\n\n', '\n');
}

// 期限超過の物品を管理者向けに1通のテキストへまとめる
function buildOverdueSummaryText(overdueItems, quotaExceeded) {
  const lines = overdueItems
    .slice()
    .sort((a, b) => b.overdueDays - a.overdueDays)
    .slice(0, OVERDUE_LIST_LIMIT)
    .map(item => {
      const mailNote = item.mailStatus === 'failed' ? '（メール送信失敗）'
        : item.mailStatus === 'skipped' ? '（送信上限のため未送信）' : '';
      return `・${formatPerson(item.name, item.organ)} 明け渡し日 ${item.handoverOn}（${item.overdueDays}日超過）${mailNote}`;
    });
  const rest = overdueItems.length - lines.length;
  let text = `[期限超過]明け渡し日を過ぎている物品が${overdueItems.length}件あります。\n${lines.join('\n')}`;
  if (rest > 0) text += `\nほか${rest}件`;
  if (quotaExceeded) text += '\n\n※Gmailの1日の送信上限に達したため、一部の利用者に期限超過メールを送れませんでした。';
  text += '\n\n撤去済みの物品はダッシュボードでアーカイブしてください。';
  return text;
}

// スプレッドシート上の日付を確認し、明け渡し3日前・当日・期限超過の物品に通知する
// - 3日前・当日: 利用者へメール、管理者へ物品ごとにLINE
// - 期限超過: 利用者へ毎日メール、管理者へ1日1通のまとめLINE
//   （撤去済み/破棄済みとしてアーカイブされる、または延長が許可されるまで続く）
// Gmail の送信上限に備え、3日前・当日のメールを先に送り、期限超過のメールは後に送る。
function handoverDayRemind() {
  const data = SHEET.getDataRange().getValues();
  const today = new Date();
  const summary = { rows: 0, sent: 0, overdueSent: 0, mailSkipped: 0, skippedStatus: 0, skippedDays: 0, invalidDate: 0, mailFailed: 0, lineFailed: 0 };
  const dueItems = [];
  const overdueItems = [];

  // 1. 通知対象を振り分ける
  for (let i = 1; i < data.length; i++) {
    summary.rows++;
    const row = data[i];
    if (!isActiveStatus(row[STATUS])) {
      summary.skippedStatus++;
      Logger.log(`[handoverDayRemind] status が active でないためスキップ: 行${i + 1} status="${row[STATUS]}"`);
      continue;
    }

    const daysDiff = calcDaysUntilHandover(row[HANDOVER_ON], today);
    if (daysDiff === null) {
      summary.invalidDate++;
      Logger.log(`[handoverDayRemind] 明け渡し日を判定できないためスキップ: 行${i + 1} handover_on="${row[HANDOVER_ON]}"`);
      continue;
    }

    const item = { email: row[EMAIL], name: row[NAME], organ: row[ORGANIZATION], handoverOnRaw: row[HANDOVER_ON], daysDiff };
    if (daysDiff < 0) {
      overdueItems.push(item);
    } else if (REMIND_DAYS.indexOf(daysDiff) !== -1) {
      dueItems.push(item);
    } else {
      summary.skippedDays++;
    }
  }

  // 2. 3日前・当日（利用者へメール、管理者へ物品ごとにLINE）
  dueItems.forEach(item => {
    const who = formatPerson(item.name, item.organ);
    const isBefore3 = item.daysDiff === 3;
    const text = isBefore3 ? `[リマインド]${who}の明け渡し日まであと3日です。` : `[リマインド]${who}の明け渡し当日です。`;
    const subject = isBefore3 ? 'STEAMコモンズ 明け渡し3日前リマインド通知' : 'STEAMコモンズ 明け渡し当日リマインド通知';
    const body = buildReminderMailBody(isBefore3 ? 'before3' : 'today', item.name, item.handoverOnRaw, item.daysDiff, today);

    Logger.log(text);
    const mailResult = sendEmail(item.email, subject, body);
    const lineResult = sendLineMessage(USER_ID, text, mailResult);
    summary.sent++;
    if (!mailResult.success) summary.mailFailed++;
    if (!lineResult.success) summary.lineFailed++;
  });

  // 3. 期限超過（利用者へ毎日メール。送信上限に達したら残りは送らない）
  let quotaExceeded = false;
  const overdueSummaryItems = overdueItems.map(item => {
    const handoverOn = formatHandoverOn(item.handoverOnRaw);
    const result = { name: item.name, organ: item.organ, handoverOn, overdueDays: -item.daysDiff, mailStatus: 'sent' };
    if (quotaExceeded) {
      result.mailStatus = 'skipped';
      summary.mailSkipped++;
      return result;
    }
    Logger.log(`[期限超過]${formatPerson(item.name, item.organ)} 明け渡し日=${handoverOn} ${-item.daysDiff}日超過`);
    const mailResult = sendEmail(item.email, 'STEAMコモンズ 明け渡し期限超過のお知らせ',
      buildReminderMailBody('overdue', item.name, item.handoverOnRaw, item.daysDiff, today));
    summary.overdueSent++;
    if (!mailResult.success) {
      summary.mailFailed++;
      result.mailStatus = 'failed';
      if (MAIL_QUOTA_ERROR_REGEX.test(mailResult.message)) quotaExceeded = true;
    }
    return result;
  });

  if (overdueSummaryItems.length > 0) {
    const lineResult = sendLineMessage(USER_ID, buildOverdueSummaryText(overdueSummaryItems, quotaExceeded));
    if (!lineResult.success) summary.lineFailed++;
  }

  Logger.log('[handoverDayRemind] summary=' + JSON.stringify(summary));
  return summary;
}

// ============================================================
// 運用セットアップ用（Apps Script エディタから手動実行）
// ============================================================

// handoverDayRemind の日次トリガーを作り直す。
// トリガーは「作成したアカウント」に紐づくため、担当者の交代・卒業時にも
// 新しい担当者のアカウントでこの関数を実行し直すこと。
function setupReminderTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === REMIND_FUNCTION_NAME)
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger(REMIND_FUNCTION_NAME)
    .timeBased()
    .everyDays(1)
    .atHour(REMIND_TRIGGER_HOUR)
    .inTimezone(REMIND_TIMEZONE)
    .create();

  Logger.log(`[setupReminderTrigger] ${REMIND_FUNCTION_NAME} の日次トリガー（${REMIND_TRIGGER_HOUR}時台）を作成しました。`);
  return listReminderTriggers();
}

// 現在のプロジェクトに設定されているトリガーを確認する。
// 注意: 他のアカウントが作成したトリガーはここには表示されない。
function listReminderTriggers() {
  const triggers = ScriptApp.getProjectTriggers().map(t => ({
    handler: t.getHandlerFunction(),
    type: String(t.getEventType()),
    id: t.getUniqueId()
  }));
  Logger.log('[listReminderTriggers] ' + JSON.stringify(triggers));
  return triggers;
}

// status 列（H列）が空欄の行を active に補完する（一度だけ手動実行）。
// status 管理導入（PR #87）以前に登録された行は status が空欄のため、
// リマインド通知・延長申請フォームの対象から外れてしまう。
// items シートには撤去・破棄済みの行は残らない運用のため、空欄は active とみなしてよい。
function backfillActiveStatus() {
  const lastRow = SHEET.getLastRow();
  if (lastRow < 2) return { updated: 0 };

  const range = SHEET.getRange(2, STATUS + 1, lastRow - 1, 1);
  const values = range.getValues();
  let updated = 0;
  const next = values.map(([v]) => {
    if (String(v || '').trim() === '') {
      updated++;
      return [STATUS_ACTIVE];
    }
    return [v];
  });
  if (updated > 0) range.setValues(next);
  Logger.log(`[backfillActiveStatus] ${updated} 行の status を active に補完しました。`);
  return { updated };
}

// 新規登録時の通知
// 呼び出し元から { name, organization, photoFileId, handoverOn } を受け取る
// handoverOn は表示用の明け渡し日文字列（例: 2026/05/10）。未指定でも通知は送る。
function registerNotify(registration) {
  if (!registration) {
    Logger.log('[line_bot registerNotify] registrationなし');
    return { status: 'error', message: '登録データがありません。' };
  }

  const name = String(registration.name || '').trim();
  const organization = String(registration.organization || '').trim();
  const photoFileId = String(registration.photoFileId || registration.photo || '').trim();
  const handoverOnRaw = String(registration.handoverOn || '').trim();
  const handoverOn = handoverOnRaw ? formatHandoverOn(handoverOnRaw) : '';
  Logger.log('[line_bot registerNotify] name=' + name + ' organization=' + organization + ' photo=' + photoFileId + ' handoverOn=' + handoverOn);

  if (!name || !photoFileId) {
    Logger.log('[line_bot registerNotify] 必須項目不足');
    return { status: 'error', message: '通知に必要な情報が不足しています。' };
  }

  const payload = {
    to: USER_ID,
    messages: [
      {
        type: 'flex',
        altText: '物品登録通知',
        contents: {
          type: 'bubble',
          hero: {
            type: 'image',
            url: 'https://lh3.googleusercontent.com/d/' + photoFileId,
            size: 'full',
            aspectRatio: '20:13',
            aspectMode: 'cover'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: '物品登録', weight: 'bold', size: 'xl' },
              { type: 'text', text: formatPerson(name, organization), size: 'md', wrap: true },
              { type: 'text', text: `明け渡し日：${handoverOn || '未取得'}`, size: 'md', wrap: true, margin: 'md' }
            ]
          }
        }
      }
    ]
  };

  const lineResult = sendLinePushObject(payload);
  if (!lineResult.success) {
    return { status: 'error', message: lineResult.message };
  }

  return { status: 'ok' };
}

// メールを送信
function sendEmail(to, subject, body) {
  try {
    if (!to || !subject || !body) {
      throw new Error("送信先、件名、本文のいずれかが空です。");
    }
    GmailApp.sendEmail(to, subject, body);
    Logger.log(`メール送信成功: ${to}`);
    return { success: true, message: "" };
  } catch (error) {
    Logger.log(`メール送信失敗: ${to}\n理由: ${error.message}`);
    return { success: false, message: error.message };
  }
}

// LINE Messaging APIでテキストメッセージを送信（sendLinePushObject の薄いラッパ）
function sendLineMessage(to, text, mailFailLog) {
  if (mailFailLog && mailFailLog.success === false) {
    text += "\n（メール送信に失敗しました。" + mailFailLog.message + ")";
  }
  return sendLinePushObject({
    to: to,
    messages: [{ type: 'text', text: text }]
  });
}

// LINE Push APIへオブジェクト送信（ステータスコード検査 + リトライ）
// 最大3回、指数バックオフ（1秒→2秒→4秒）。4xx はリトライせず即時失敗。
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
        Logger.log(`送信成功 (試行${attempt}): ${body}`);
        return { success: true, message: '' };
      }
      lastError = `HTTP ${statusCode}: ${body}`;
      Logger.log(`送信失敗 (試行${attempt}): ${lastError}`);
      // 4xx はクライアント側の問題なのでリトライしない
      if (statusCode >= 400 && statusCode < 500) {
        return { success: false, message: lastError };
      }
    } catch (e) {
      lastError = String(e);
      Logger.log(`送信失敗 (試行${attempt}): ${lastError}`);
    }
    if (attempt < MAX_ATTEMPTS) {
      Utilities.sleep(Math.pow(2, attempt - 1) * 1000);
    }
  }
  return { success: false, message: lastError };
}