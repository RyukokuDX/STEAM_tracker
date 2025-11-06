<<<<<<< HEAD
// Code.gs
const SPREADSHEET_ID = "1kGzhtCne-zbaGDMzWf1SdX3IH0EVtodszGXN3prP7C4";
const DOMAIN = 'mail.ryukoku.ac.jp';

function getFiscalYearEnd(todayDate) {
  const year = todayDate.getFullYear();
  const thisYearMar20 = new Date(year, 2, 20);
  const normalize = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const t = normalize(todayDate);
  const m = normalize(thisYearMar20);
  if (t > m) return new Date(year + 1, 2, 20);
  return m;
}

// include 用（今回は index.html に全文を入れているので使わないが残す）
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doGet(e) {
  const email = Session.getActiveUser().getEmail();
  if (!email || !email.endsWith('@' + DOMAIN)) {
    return HtmlService.createHtmlOutput('アクセス拒否：ドメイン外または未サインイン')
      .setTitle('アクセス拒否');
  }
  const tpl = HtmlService.createTemplateFromFile('index');
  const now = new Date();
  const tz = Session.getScriptTimeZone();
  tpl.fiscalEndStr = Utilities.formatDate(getFiscalYearEnd(now), tz, "yyyy-MM-dd");
  tpl.todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  tpl.email = email;
  tpl.domain = DOMAIN;
  return tpl.evaluate().setTitle("年度末制限フォーム").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * 利用規約への同意を記録する（consent_log シートを作る）
 */
function logConsent() {
  const serverEmail = Session.getActiveUser().getEmail();
  if (!serverEmail || !serverEmail.endsWith('@' + DOMAIN)) {
    return { status: 'error', message: 'サインインまたはドメイン確認に失敗しました。' };
  }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName("consent_log") || ss.insertSheet("consent_log");
    if (sh.getLastRow() === 0) {
      sh.appendRow(["timestamp", "email", "note"]);
    }
    sh.appendRow([new Date(), serverEmail, "利用規約（画面同意）"]);
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', message: String(err) };
  }
}

/**
 * フォーム送信（既存の submitForm）
 */
function submitForm(payload) {
  try {
    const serverEmail = Session.getActiveUser().getEmail();
    if (!serverEmail || !serverEmail.endsWith('@' + DOMAIN)) {
      throw new Error("アクセス拒否：サインインまたはドメイン確認に失敗しました。");
    }
    if (!payload || !payload.date) throw new Error("日付が指定されていません。");

    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
    const fiscalEndStr = Utilities.formatDate(getFiscalYearEnd(now), tz, "yyyy-MM-dd");
    const selected = payload.date;

    if (selected < todayStr) throw new Error("過去の日付は選べません。");
    if (selected > fiscalEndStr) throw new Error("選択した日付は年度末（" + fiscalEndStr + "）を超えています。");

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName("responses") || ss.insertSheet("responses");
    if (sh.getLastRow() === 0) {
      sh.appendRow(["タイムスタンプ", "名前", "email", "selectedDate"]);
    }
    sh.appendRow([new Date(), payload.name || "", serverEmail, selected]);

    return { status: "ok", message: "送信完了（年度末: " + fiscalEndStr + "）" };
  } catch (err) {
    return { status: "error", message: err.message || String(err) };
=======
const SPREAD_SHEET = SpreadsheetApp.openById("1U3enu3ETOh_seroYmpO95p2yjW2RSUC7WRLyDk1rhs8");
const SHEET = SPREAD_SHEET.getSheetByName("管理シート");
const ACCESS_TOKEN = 'Wl7oj84NxBzYNRy0YWLn2bw36m10IWrHR3GmguKTM/QwBpnDakpP7leNgh0cWurBE+joXlj0T/ClOQ/ZJxzs/R2HvdM1d0W1JdqG/pQCC/kylvdqJcOC6vKr1JJXjnOO18XlBB9aLagFd0T+iiSfswdB04t89/1O/w1cDnyilFU=';
const USER_ID = 'Uc96692787f41d9a314b78aff7a7c3c42';

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
>>>>>>> develop
  }
}
