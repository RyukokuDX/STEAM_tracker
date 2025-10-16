// Code.gs
const SPREADSHEET_ID = "1In4qBOnN2vd-mFGkDe5BoTfLORlUssFHYTt1JG_QQ_E";

/**
 * 指定日時（Dateオブジェクト）を基に、その"年度末"を返す。
 * ここでは年度末を毎年「3月20日」と定義する。
 * 返すのは Date オブジェクト（該当年の 3月20日 の 00:00:00）。
 * ロジック：今年の 3/20 を作って、もし today > thisMar20 なら来年の 3/20 を返す。
 */
function getFiscalYearEnd(todayDate) {
  // todayDate は Date
  const year = todayDate.getFullYear();
  // 月は 0 ベース → 2 は 3月
  const thisYearMar20 = new Date(year, 2, 20); // yyyy-03-20 00:00:00
  // 比較：日付の時刻部分も影響するので、日付のみ比較したい場合は時刻を正規化する
  const normalize = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const t = normalize(todayDate);
  const m = normalize(thisYearMar20);

  if (t > m) {
    // 今日が今年の3/20 より後 → 次の年の 3/20 を返す
    return new Date(year + 1, 2, 20);
  } else {
    // 今日が 3/20 以前（含む） → 今年の 3/20 を返す
    return m;
  }
}

// doGet で fiscalEnd をテンプレートに渡してクライアント側で max を設定できるようにする
function doGet(e) {
  const tpl = HtmlService.createTemplateFromFile('index');
  const now = new Date();
  // Apps Script のタイムゾーンで評価したい場合は Utilities.formatDate を使って文字列で渡す
  const tz = Session.getScriptTimeZone();
  const fiscalEndDate = getFiscalYearEnd(now);
  tpl.fiscalEndStr = Utilities.formatDate(fiscalEndDate, tz, "yyyy-MM-dd"); // 例 "2026-03-20"
  tpl.todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  return tpl.evaluate().setTitle("年度末制限フォーム");
}

/**
 * payload.date は "YYYY-MM-DD" 形式の文字列を想定している
 */
function submitForm(payload) {
  try {
    if (!payload || !payload.date) {
      throw new Error("日付が指定されていません。");
    }
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");

    // サーバ側で年度末を計算し、比較する
    const fiscalEnd = getFiscalYearEnd(now);
    const fiscalEndStr = Utilities.formatDate(fiscalEnd, tz, "yyyy-MM-dd");

    const selected = payload.date; // "YYYY-MM-DD"

    if (selected < todayStr) {
      throw new Error("過去の日付は選べません。");
    }
    if (selected > fiscalEndStr) {
      throw new Error("選択した日付は年度末（" + fiscalEndStr + "）を超えています。");
    }

    // 検証を通ったらスプレッドシートに書き込む
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName("responses") || ss.insertSheet("responses");
    if (sh.getLastRow() === 0) {
      sh.appendRow(["タイムスタンプ", "名前", "email", "selectedDate"]);
    }
    sh.appendRow([new Date(), payload.name || "", payload.email || "", selected]);

    return { status: "ok", message: "送信完了（年度末: " + fiscalEndStr + "）" };
  } catch (err) {
    return { status: "error", message: err.message || String(err) };
  }
}