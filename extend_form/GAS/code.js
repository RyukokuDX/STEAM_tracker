// Code.gs（延長申請フォーム）

const scriptProperties = PropertiesService.getScriptProperties();
const ACCESS_TOKEN = scriptProperties.getProperty('ACCESS_TOKEN');
const USER_ID = scriptProperties.getProperty('USER_ID');
const SPREAD_SHEET_ID = scriptProperties.getProperty('SPREAD_SHEET_ID');
const SHEET_NAME_MANAGE = scriptProperties.getProperty('SHEET_NAME_MANAGE');

const SPREAD_SHEET = SpreadsheetApp.openById(SPREAD_SHEET_ID);
const SHEET = SPREAD_SHEET.getSheetByName(SHEET_NAME_MANAGE);

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
    notifyExtensionRequest(payload.results);
    result = { status: 'ok' };

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
      const id = Number(params.id);

      if (!Number.isInteger(id) || id < 1) {
        Logger.log('[line webhook] 無効な id: ' + params.id);
        return;
      }

      if (params.action === 'approve' && params.date) {
        approveRequest(id, params.date);
      } else if (params.action === 'reject') {
        rejectRequest(id);
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
// 年度末の日付を取得
// ============================================================
function GetFiscalYearEnd(dateStr) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const fiscalYear = month >= 4 ? year + 1 : year;
  return `${fiscalYear}-03-31`;
}

// ============================================================
// メールアドレスをもとに物品を取得
// ============================================================
function getItemsByEmail(email) {
  const data = SHEET.getDataRange().getValues();
  const results = [];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][EMAIL]).toLowerCase() === String(email).toLowerCase()) {
      results.push({
        id: i,
        name: data[i][NAME],
        organ: data[i][ORGANIZATION],
        handover: Utilities.formatDate(new Date(data[i][HANDOVER_ON]), "Asia/Tokyo", "yyyy-MM-dd"),
        maxDate: GetFiscalYearEnd(data[i][HANDOVER_ON]),
        image: `https://lh3.googleusercontent.com/d/${data[i][PHOTO_FILE_ID]}`
      });
    }
  }

  return results;
}

// ============================================================
// 延長申請をLINEに送信
// ============================================================
function notifyExtensionRequest(results) {
  const data = SHEET.getDataRange().getValues();

  results.forEach(item => {
    const id = item.id;
    const newDate = item.newDate;
    const name = data[id][NAME];
    const organ = data[id][ORGANIZATION];

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
              url: `https://lh3.googleusercontent.com/d/${data[id][PHOTO_FILE_ID]}`,
              size: "full",
              aspectRatio: "20:13",
              aspectMode: "cover"
            },
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: `延長申請 No.${id}`, weight: "bold", size: "xl" },
                { type: "text", text: `${organ}（${name}）`, size: "md", wrap: true, margin: "md" },
                { type: "text", text: `希望延長日：${newDate}`, size: "md", wrap: true, margin: "md" }
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
                    data: `action=approve&id=${id}&date=${newDate}`
                  }
                },
                {
                  type: "button",
                  style: "secondary",
                  color: "#FF0000",
                  action: {
                    type: "postback",
                    label: "却下",
                    data: `action=reject&id=${id}`
                  }
                }
              ]
            }
          }
        }
      ]
    };

    sendLinePushObject(payload);
  });
}

// ============================================================
// 延長申請の許可
// ============================================================
function approveRequest(id, newDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    Logger.log(`無効な日付形式: ${newDate}`);
    return;
  }
  const data = SHEET.getDataRange().getValues();
  if (!Number.isInteger(id) || id < 1 || id >= data.length) {
    Logger.log(`無効な id: ${id}`);
    return;
  }
  SHEET.getRange(id + 1, HANDOVER_ON + 1).setValue(newDate);
  const email = data[id][EMAIL];
  const name = data[id][NAME];
  const organ = data[id][ORGANIZATION];

  sendEmail(email,
    'STEAMコモンズ 延長申請許可通知',
    `${name}さん（${organ}）\n\n延長申請が許可されました。\n新しい明け渡し日: ${newDate}\n\nこのメッセージに心当たりがない場合は、STEAMコモンズまでお越しください。`
  );
  sendLineMessage(USER_ID, `延長申請No.${id}を ${newDate} まで許可しました。`);
}

// ============================================================
// 延長申請の却下
// ============================================================
function rejectRequest(id) {
  const data = SHEET.getDataRange().getValues();
  if (typeof id !== "number" || id < 0 || id >= data.length) {
    Logger.log(`無効な id: ${id}`);
    return;
  }
  const email = data[id][EMAIL];
  const name = data[id][NAME];
  const organ = data[id][ORGANIZATION];

  sendEmail(email,
    'STEAMコモンズ 延長申請却下通知',
    `${name}さん（${organ}）\n\n延長申請が却下されました。\n\nこのメッセージに心当たりがない場合は、STEAMコモンズまでお越しください。`
  );
  sendLineMessage(USER_ID, `延長申請No.${id}を却下しました。`);
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
  sendLinePushObject({
    to,
    messages: [{ type: 'text', text }]
  });
}

// ============================================================
// LINE オブジェクト送信
// ============================================================
function sendLinePushObject(payload) {
  const url = "https://api.line.me/v2/bot/message/push";
  const options = {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + ACCESS_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  try {
    const res = UrlFetchApp.fetch(url, options);
    Logger.log("LINE送信成功: " + res.getContentText());
  } catch (e) {
    Logger.log("LINE送信失敗: " + e);
  }
}

// ============================================================
// 権限取得用（初回実行時に使用）
// ============================================================
function requestGmailPermission() {
  GmailApp.sendEmail(Session.getActiveUser().getEmail(), "権限テスト", "これは権限確認用のテストです");
}
