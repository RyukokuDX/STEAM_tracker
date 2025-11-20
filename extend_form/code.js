const SPREAD_SHEET = SpreadsheetApp.openById("1ImQWr-iBAL_DWBsQ_MgcONheBEjdHur7GhzhE2GVWs0");
const SHEET = SPREAD_SHEET.getSheetByName("管理シート");

const scriptProperties = PropertiesService.getScriptProperties();
const ACCESS_TOKEN = scriptProperties.getProperty('ACCESS_TOKEN');
const USER_ID = scriptProperties.getProperty('USER_ID');

// 列要素
const RESISTERED_AT = 0;        // フォーム送信時刻（自動記録）
const EMAIL = 1;                // 登録者メール
const NAME = 2;                 // 登録者氏名
const ORGANIZATION = 3;         // 団体名
const PHOTO_FILE_ID = 4;        // Drive ファイル ID
const HANDOVER_ON = 5;          // 明け渡し日（YYYY-MM-DD）
const DAYS_UNTIL_HANDOVER = 6;  // 明け渡し日までの日数（計算列） 
const STATUS = 7;               // active / archived / pending
const ADMIN_NOTE = 8;           // 管理者備考

const FORM_URL = "";            // フォームURL

// === HTMLフォーム表示 ===
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("延長申請フォーム")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// メールアドレスをもとに物品を取得
function GetItemsByEmail(email) {
  const data = SHEET.getDataRange().getValues();
  let results = [];
  
  // 登録データ探索
  for (let i = 1; i < data.length; i++) {
    if (data[i][EMAIL] === email) {
      results.push({
        id: i,
        name: data[i][NAME],
        organ: data[i][ORGANIZATION],
        handover: Utilities.formatDate(new Date(data[i][HANDOVER_ON]), "Asia/Tokyo", "yyyy-MM-dd"),
        maxDate: "2025-03-31",
        image: `https://drive.google.com/uc?export=view&id=${data[i][PHOTO_FILE_ID]}`,

      });
    }
  }
  
  return results;
}

// LINE Messaging APIでメッセージを送信
function sendLineMessage(to, text) {
  const url = 'https://api.line.me/v2/bot/message/push';

  const payload = {
    to: to,
    messages: [{ type: 'text', text: text }]
  };

  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Authorization': 'Bearer ' + ACCESS_TOKEN
    },
    payload: JSON.stringify(payload)
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    Logger.log('送信成功: ' + response.getContentText());
  } catch (e) {
    Logger.log('送信失敗: ' + e);
  }
}