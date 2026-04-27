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
  throw new Error(`シート "${SHEET_NAME_MANAGE}" が見つかりません。SHEET_NAME_MANAGE を確認してください。`);
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

// スプレッドシート上の日付を確認し、一致する日付であればメッセージ送信
function handoverDayRemind() {
  const data = SHEET.getDataRange().getValues();

  // 登録者全員のデータ確認
  for  ( let  i  =  1 ;  i  < data.length;  i ++ )  {
    // メッセージに使用する要素
    const email = data[i][EMAIL];
    const name = data[i][NAME];
    const organ = data[i][ORGANIZATION];
    const status = data[i][STATUS];
    const handoverDay = Number(data[i][DAYS_UNTIL_HANDOVER]);

    if (!isActiveStatus(status)) continue;

    let mailFailLog = null; // メール送信失敗時のログ

    // 明け渡し日の判定
    if (handoverDay !== 3 && handoverDay !== 0) continue;
    else if (handoverDay === 3) 
    {
      const text = `[リマインド]${organ}の${name}さんの明け渡し日まであと3日です。`;
      const subject = `STEAMコモンズ 明け渡し3日前リマインド通知`;
      const body = `${name}さん。物品の明け渡し3日前となりました。\n3日以内に物品の撤去、又は以下のURLから延長申請を行ってください。\n${FORM_URL}\n\nこのメッセージに心当たりが無い場合は、STEAMコモンズまでお越しください。`;
      
      Logger.log(text);

      mailFailLog = sendEmail(email, subject, body);
      sendLineMessage(USER_ID, text, mailFailLog);
    } 
    else if (handoverDay === 0)
    {
      const text = `[リマインド]${organ}の${name}さんの明け渡し当日です。`;
      const subject = `STEAMコモンズ 明け渡し当日リマインド通知`;
      const body = `${name}さん。明け渡し当日となりました。\n本日中に物品の撤去、又は以下のURLから延長申請を行ってください。\n${FORM_URL}\n\nこのメッセージに心当たりが無い場合は、STEAMコモンズまでお越しください。`;
      Logger.log(text);
      mailFailLog = sendEmail(email, subject, body);
      Logger.log(mailFailLog);
      sendLineMessage(USER_ID, text, mailFailLog);
    }
  }
}

// 新規登録時の通知
// 呼び出し元から { name, organization, photoFileId } を受け取る
function registerNotify(registration) {
  if (!registration) {
    Logger.log('[line_bot registerNotify] registrationなし');
    return { status: 'error', message: '登録データがありません。' };
  }

  const name = String(registration.name || '').trim();
  const organization = String(registration.organization || '').trim();
  const photoFileId = String(registration.photoFileId || registration.photo || '').trim();
  Logger.log('[line_bot registerNotify] name=' + name + ' organization=' + organization + ' photo=' + photoFileId);

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
              { type: 'text', text: `${name}（${organization || '団体名未入力'}）`, size: 'md', wrap: true }
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