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

// スプレッドシート上の日付を確認し、一致する日付であればメッセージ送信1
function handoverDayRemind() {
  const data = SHEET.getDataRange().getValues();

  // 登録者全員のデータ確認
  for (let i = 1; i < data.length; i++) 
  {
    // メッセージに使用する要素
    const email = data[i][EMAIL];
    const name = data[i][NAME];
    const organ = data[i][ORGANIZATION];
    const handover = data[i][HANDOVER_ON];
    const handoverDay = data[i][DAYS_UNTIL_HANDOVER];

    let mailFailLog = ""; // メール送信失敗時のログ

    // 明け渡し日の判定
    if (handoverDay !== 3 && handoverDay !== 0) continue;
    else if (handoverDay === 3) 
    {
      const text = `[リマインド]${organ}の${name}さんの明け渡し日まであと3日です。`;
      const subject = `STEAMコモンズ 明け渡し3日前リマインド通知`;
      const body = `${name}さん。物品の明け渡し3日前となりました。\n3日以内に物品の撤去または延長申請を行ってください。\n${FORM_URL}`;
      
      Logger.log(text);

      mailFailLog = sendEmail(email, subject, body);
      sendLineMessage(USER_ID, text, mailFailLog);
    } 
    else if (handoverDay === 0)
    {
      const text = `[リマインド]${organ}の${name}さんの明け渡し当日です。`;
      const subject = `STEAMコモンズ 明け渡し当日リマインド通知`;
      const body = `${name}さん。明け渡し当日となりました。\n本日中に物品の撤去または延長申請を行ってください。\n${FORM_URL}`;
      Logger.log(text);
      mailFailLog = sendEmail(email, subject, body);
      sendLineMessage(USER_ID, text, mailFailLog);
    }
    else
    { 
      const text = i + "行目で例外が発生しました。";
      Logger.log(text); 
    }
  }
}

// 物品登録の通知
function registerNotify()
{
  // メッセージに使用する要素
  const name = "";
  const organ = "";
  
  const text = `[物品登録]${organ}の${name}さんが物品を登録しました。`;
  sendLineMessage(USER_ID, text);
}

// 延長申請の通知
function extendRequestNotify()
{
  // メッセージに使用する要素
  const name = "";
  const organ = "";

  const text = `[延長申請]${organ}の${name}さんが延長を申請しました。\n こちらのフォームから延長を承認してください。\n${FORM_URL}`;
  sendLineMessage(USER_ID, text);
} 

// archived状態の行をアーカイブ処理
function archiveCompletedItems() {
  const data = SHEET.getDataRange().getValues();

  for (let i = 0; i < data.length; i++) {
    const status = data[i][STATUS];
    if (status === "archived") {
      Logger.log(`アーカイブ処理対象: ${i + 1}行目`)
    }
  }
}

// メールを送信
function sendEmail(to, subject, body) {
  try {
    if (!to || !subject || !body) {
      throw new Error("送信先、件名、本文のいずれかが空です。");
    }
    GmailApp.sendEmail(to, subject, body);
    Logger.log(`メール送信成功: ${to}`);
    return 0; 
  } catch (error) {
    Logger.log(`メール送信失敗: ${to}\n理由: ${error.message}`);
    return error.message;
  }
}

// LINE Messaging APIでメッセージを送信
function sendLineMessage(to, text, mailFailLog = 0) {
  const url = 'https://api.line.me/v2/bot/message/push';
  if (mailFailLog !== 0) {
    text += "\n（メール送信に失敗しました。" + mailFailLog + ")";
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