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
const FORM_URL = getRequiredProperty('FORM_URL');
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
const DAYS_UNTIL_HANDOVER = 6;  // 明け渡し日までの日数（計算列） 
const STATUS = 7;               // active / archived / pending
const ADMIN_NOTE = 8;           // 管理者備考
const STATUS_ACTIVE = 'active';

function isActiveStatus(status) {
  return String(status || '').trim().toLowerCase() === STATUS_ACTIVE;
}

const REMIND_DAYS = [3, 0];          // リマインド対象とする残り日数
const REMIND_TRIGGER_HOUR = 9;      // 日次トリガーの実行時刻（9〜10時の間に実行される）
const REMIND_FUNCTION_NAME = 'handoverDayRemind';
const REMIND_TIMEZONE = 'Asia/Tokyo';     // 残り日数の算出・トリガー実行時刻の基準

// 明け渡し日（F列）から、今日を基準にした残り日数を算出する。
// G列の計算式が壊れている・未入力の行でも判定できるよう、F列を正とする。
// 算出できない場合は null を返す。
function calcDaysUntilHandover(handoverOn, today) {
  if (handoverOn === '' || handoverOn === null || handoverOn === undefined) return null;
  const date = handoverOn instanceof Date ? handoverOn : new Date(String(handoverOn).replace(/-/g, '/'));
  if (isNaN(date.getTime())) return null;

  // 日付は日本時間で切り出す。スプレッドシートやプロジェクトのタイムゾーン設定が
  // 日本以外になっていると「今日」が前日扱いになり、通知日が1日ずれるため固定する。
  const tz = REMIND_TIMEZONE;
  const toDayNumber = (d) => {
    const [y, m, day] = Utilities.formatDate(d, tz, 'yyyy-MM-dd').split('-').map(Number);
    return Date.UTC(y, m - 1, day) / 86400000;
  };
  return toDayNumber(date) - toDayNumber(today);
}

// G列の値を残り日数として解釈する（F列から算出できない場合のフォールバック）。
// 空欄を Number('') === 0 と誤判定して「当日」通知を出さないよう、空欄は null とする。
function parseDaysColumn(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// スプレッドシート上の日付を確認し、一致する日付であればメッセージ送信
function handoverDayRemind() {
  const data = SHEET.getDataRange().getValues();
  const today = new Date();
  const summary = { rows: 0, sent: 0, skippedStatus: 0, skippedDays: 0, invalidDate: 0, mailFailed: 0, lineFailed: 0 };

  // 登録者全員のデータ確認
  for (let i = 1; i < data.length; i++) {
    // メッセージに使用する要素
    const email = data[i][EMAIL];
    const name = data[i][NAME];
    const organ = data[i][ORGANIZATION];
    const status = data[i][STATUS];
    summary.rows++;

    if (!isActiveStatus(status)) {
      summary.skippedStatus++;
      Logger.log(`[handoverDayRemind] status が active でないためスキップ: 行${i + 1} status="${status}"`);
      continue;
    }

    let handoverDay = calcDaysUntilHandover(data[i][HANDOVER_ON], today);
    if (handoverDay === null) {
      handoverDay = parseDaysColumn(data[i][DAYS_UNTIL_HANDOVER]);
    }
    if (handoverDay === null) {
      summary.invalidDate++;
      Logger.log(`[handoverDayRemind] 明け渡し日を判定できないためスキップ: 行${i + 1} handover_on="${data[i][HANDOVER_ON]}" days="${data[i][DAYS_UNTIL_HANDOVER]}"`);
      continue;
    }

    // 明け渡し日の判定
    if (REMIND_DAYS.indexOf(handoverDay) === -1) {
      summary.skippedDays++;
      continue;
    }

    let text, subject, body;
    if (handoverDay === 3) {
      text = `[リマインド]${organ}の${name}さんの明け渡し日まであと3日です。`;
      subject = `STEAMコモンズ 明け渡し3日前リマインド通知`;
      body = `${name}さん。物品の明け渡し3日前となりました。\n3日以内に物品の撤去、又は以下のURLから延長申請を行ってください。\n${FORM_URL}\n\nこのメッセージに心当たりが無い場合は、STEAMコモンズまでお越しください。`;
    } else {
      text = `[リマインド]${organ}の${name}さんの明け渡し当日です。`;
      subject = `STEAMコモンズ 明け渡し当日リマインド通知`;
      body = `${name}さん。明け渡し当日となりました。\n本日中に物品の撤去、又は以下のURLから延長申請を行ってください。\n${FORM_URL}\n\nこのメッセージに心当たりが無い場合は、STEAMコモンズまでお越しください。`;
    }

    Logger.log(text);
    const mailFailLog = sendEmail(email, subject, body); // メール送信失敗時のログ
    const lineResult = sendLineMessage(USER_ID, text, mailFailLog);
    summary.sent++;
    if (!mailFailLog.success) summary.mailFailed++;
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
  const handoverOn = String(registration.handoverOn || '').trim();
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
              { type: 'text', text: `${name}（${organization || '団体名未入力'}）`, size: 'md', wrap: true },
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