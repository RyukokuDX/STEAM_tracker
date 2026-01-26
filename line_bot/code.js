const scriptProperties = PropertiesService.getScriptProperties();
const ACCESS_TOKEN = scriptProperties.getProperty('ACCESS_TOKEN');
const USER_ID = scriptProperties.getProperty('USER_ID');
const FORM_URL = scriptProperties.getProperty('FORM_URL');
const SPREAD_SHEET_ID = scriptProperties.getProperty('SPREAD_SHEET_ID');
const SHEET_NAME_MANAGE = scriptProperties.getProperty('SHEET_NAME_MANAGE');

const SPREAD_SHEET = SpreadsheetApp.openById(SPREAD_SHEET_ID);
const SHEET = SPREAD_SHEET.getSheetByName(SHEET_NAME_MANAGE);

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


// スプレッドシート上の日付を確認し、一致する日付であればメッセージ送信
function handoverDayRemind() {
  const data = SHEET.getDataRange().getValues();

  // 登録者全員のデータ確認
  for  ( let  i  =  1 ;  i  < data.length;  i ++ )  {
    // メッセージに使用する要素
    const email = data[i][EMAIL];
    const name = data[i][NAME];
    const organ = data[i][ORGANIZATION];
    const handoverDay = data[i][DAYS_UNTIL_HANDOVER];

    let mailFailLog = null; // メール送信失敗時のログ

    // 明け渡し日の判定
    if (handoverDay !== 3 && handoverDay !== 0) continue;
    else if (handoverDay === 3) 
    {
      const text = `[リマインド]${organ}の${name}さんの明け渡し日まであと3日です。`;
      const subject = `STEAMコモンズ 明け渡し3日前リマインド通知`;
      const body = `${name}さん。物品の明け渡し3日前となりました。\n3日以内に物品の撤去、又は以下のURLから延長申請を行ってください。\n${FORM_URL}\n\n
                    このメッセージに心当たりが無い場合は、STEAMコモンズまでお越しください。`;
      
      Logger.log(text);

      mailFailLog = sendEmail(email, subject, body);
      sendLineMessage(USER_ID, text, mailFailLog);
    } 
    else if (handoverDay === 0)
    {
      const text = `[リマインド]${organ}の${name}さんの明け渡し当日です。`;
      const subject = `STEAMコモンズ 明け渡し当日リマインド通知`;
      const body = `${name}さん。明け渡し当日となりました。\n本日中に物品の撤去、又は以下のURLから延長申請を行ってください。\n${FORM_URL}\n\n
                    このメッセージに心当たりが無い場合は、STEAMコモンズまでお越しください。`;
      Logger.log(text);
      mailFailLog = sendEmail(email, subject, body);
      console.log(mailFailLog);
      sendLineMessage(USER_ID, text, mailFailLog);
    }
  }
}

// 前日に登録された物品についての通知
function registerNotify() {
  const data = SHEET.getDataRange().getValues();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = Utilities.formatDate(yesterday, 'Asia/Tokyo', 'yyyy-MM-dd');

  for (let i = 1; i < data.length; i++) {
    const registeredAt = data[i][REGISTERED_AT];  // 登録日時
    if (!registeredAt) continue;
    // 日付部分だけ抽出
    const registeredDate = Utilities.formatDate(new Date(registeredAt), 'Asia/Tokyo', 'yyyy-MM-dd');
    if (registeredDate !== yesterdayDate) continue;

    Logger.log(`登録通知: ${i}行目`);
    const name = data[i][NAME];
    const organ = data[i][ORGANIZATION];

    // 画像付きメッセージ送信
    const payload = {
      to: USER_ID,
      messages: [
        {
          type: "flex",
          altText: "物品登録通知",
          contents: {
            type: "bubble",
            hero: {
              type: "image",
              url: "https://drive.google.com/uc?export=view&id=" + data[i][PHOTO_FILE_ID],
              size: "full",
              aspectRatio: "20:13",
              aspectMode: "cover"
            },
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: "物品登録", weight: "bold", size: "xl" },
                { type: "text", text: `${data[i][NAME]}（${data[i][ORGANIZATION]}）`, size: "md", wrap: true }
              ]
            }
          }
        }
      ]
    };
    sendLinePushObject(payload);

    // sendLineMessage(USER_ID, text);
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

// LINE Messaging APIでメッセージを送信
function sendLineMessage(to, text, mailFailLog) {
  const url = 'https://api.line.me/v2/bot/message/push';
  if (mailFailLog.success === false) {
    text += "\n（メール送信に失敗しました。" + mailFailLog.message + ")";
  }

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

// オブジェクト送信
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
    Logger.log("送信成功: " + res.getContentText());
  } catch (e) {
    Logger.log("送信失敗: " + e);
  }
}