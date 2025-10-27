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
  }
}
