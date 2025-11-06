// Code.gs
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
if (!SPREADSHEET_ID) {
  throw new Error(
    "SPREADSHEET_ID script property is not set. Please set it in the Apps Script dashboard under Project Settings > Script Properties."
  );
}
const DOMAIN = 'mail.ryukoku.ac.jp';
const LOCK_TIMEOUT_MS = 30000; // 30秒
const MAX_NAME_LENGTH = 50;    // 名前の最大文字数

/**
 * 年度末日を取得 (3月31日を基準とする)
 * - 3/31を含む（当日も年度末とみなす）
 * - 3/31を過ぎていたら翌年の3/31を返す
 */
function getFiscalYearEnd(todayDate) {
  const year = todayDate.getFullYear();
  const thisYearMar31 = new Date(year, 2, 31); // monthは0-based (3月は2)
  const normalize = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const t = normalize(todayDate);
  const m = normalize(thisYearMar31);
  // 3/31を含むため t > m を使用
  if (t > m) return new Date(year + 1, 2, 31);
  return m;
}

/**
 * メールアドレスを取得し、ドメインをチェック
 * @returns {Object} {email: string, error: string}
 */
function getVerifiedEmail() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (!email) {
      Logger.log("[認証エラー] メールアドレスの取得に失敗");
      return {
        error: "認証に失敗しました。ブラウザを再読み込みして再度サインインしてください。"
      };
    }
    if (!email.endsWith('@' + DOMAIN)) {
      Logger.log(`[認証エラー] 無効なドメイン: ${email}`);
      return {
        error: `このフォームは ${DOMAIN} ドメインのみ利用できます。`
      };
    }
    return { email };
  } catch (err) {
    Logger.log(`[認証エラー] 例外発生: ${err}`);
    return {
      error: "認証中にエラーが発生しました。ブラウザを再読み込みしてお試しください。"
    };
  }
}

/**
 * フォームを表示
 * X-Frame-Options: SAMEORIGIN で埋め込み制限（セキュリティ対策）
 */
function doGet(e) {
  const auth = getVerifiedEmail();
  if (auth.error) {
    return HtmlService.createHtmlOutput(auth.error)
      .setTitle('アクセス拒否');
  }

  const tpl = HtmlService.createTemplateFromFile('index');
  const now = new Date();
  const tz = Session.getScriptTimeZone();
  tpl.fiscalEndStr = Utilities.formatDate(getFiscalYearEnd(now), tz, "yyyy-MM-dd");
  tpl.todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  tpl.email = auth.email;
  tpl.domain = DOMAIN;
  
  // Avoid calling setXFrameOptionsMode because some GAS runtimes may not
  // expose the XFrameOptionsMode enum (leading to a null 'mode' error).
  // If you need to change framing behavior, set it in the Apps Script
  // deployment settings or use the explicit ALLOWALL value if available.
  return tpl.evaluate()
    .setTitle("年度末制限フォーム");
}

/**
 * 日付文字列のバリデーション
 * @returns {Object} {date: Date, error: string}
 */
function validateDate(dateStr) {
  if (!dateStr) return { error: "日付が指定されていません" };
  
  // YYYY-MM-DD 形式であることを確認
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { error: "日付の形式が不正です (YYYY-MM-DD)" };
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return { error: "無効な日付です" };
  }

  // 時刻部分を切り捨て（normalize）
  return { 
    date: new Date(date.getFullYear(), date.getMonth(), date.getDate())
  };
}


/**
 * フォーム送信（排他制御、厳格なバリデーション付き）
 */
function submitForm(payload) {
  if (!payload) {
    return { 
      status: "error",
      message: "送信データが空です"
    };
  }

  const auth = getVerifiedEmail();
  if (auth.error) {
    return { 
      status: "error",
      message: auth.error
    };
  }

  // 名前の必須チェックと文字数制限
  if (!payload.name || payload.name.trim().length === 0) {
    return {
      status: "error",
      message: "名前は必須です"
    };
  }
  if (payload.name.length > MAX_NAME_LENGTH) {
    return {
      status: "error",
      message: `名前は${MAX_NAME_LENGTH}文字以内で入力してください`
    };
  }

  // 日付の厳格なバリデーション
  const dateResult = validateDate(payload.date);
  if (dateResult.error) {
    return {
      status: "error",
      message: dateResult.error
    };
  }

  // 写真は必須
  if (!payload.photo || String(payload.photo).trim() === '') {
    Logger.log('[submitForm] 写真ファイルIDが指定されていません');
    return { status: 'error', message: '写真は必須です。' };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);  // 時刻部分を切り捨て

  const fiscalEnd = getFiscalYearEnd(now);
  if (dateResult.date < now) {
    return {
      status: "error",
      message: "過去の日付は選択できません"
    };
  }
  if (dateResult.date > fiscalEnd) {
    return {
      status: "error",
      message: `選択した日付は年度末（${Utilities.formatDate(fiscalEnd, Session.getScriptTimeZone(), "yyyy-MM-dd")}）を超えています`
    };
  }

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
      Logger.log("[フォーム送信] ロック取得タイムアウト");
      throw new Error("サーバーが混み合っています。しばらく待ってから再度お試しください。");
    }
    locked = true;

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    // Save into the 管理シート to match existing spreadsheet layout
    const shName = "管理シート";
    const sh = ss.getSheetByName(shName) || ss.insertSheet(shName);

    // ヘッダーチェックと追加を排他制御
    if (sh.getLastRow() === 0) {
      sh.appendRow([
        "タイムスタンプ",
        "メールアドレス",
        "氏名",
        "団体名",
        "写真",
        "明け渡し日",
        "残り日数",
        "状態",
        "備考欄"
      ]);
    }

    const tz = Session.getScriptTimeZone();
    sh.appendRow([
      new Date(),
      auth.email,
      payload.name.trim(),
      payload.organization || "",
      payload.photo || "",
      Utilities.formatDate(dateResult.date, tz, "yyyy/MM/dd"),
      "",
      "",
      ""
    ]);

    Logger.log(`[フォーム送信] 成功: ${auth.email}, date=${payload.date}`);
    return {
      status: "ok",
      message: `送信完了（年度末: ${Utilities.formatDate(fiscalEnd, tz, "yyyy-MM-dd")}）`
    };

  } catch (err) {
    Logger.log(`[フォーム送信] エラー: ${err}`);
    return {
      status: "error",
      message: err.message || "送信中にエラーが発生しました"
    };

  } finally {
    if (locked) lock.releaseLock();
  }
}

/**
 * Upload a base64 data URL image to a specified Drive folder and return the file ID.
 * @param {string} dataUrl - data:[<mediatype>][;base64],<data>
 * @param {string} filename - original filename (optional)
 */
function uploadPhoto(dataUrl, filename) {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new Error('アップロードするデータがありません');
    }

    // Parse data URL
    const m = dataUrl.match(/^data:(.+);base64,(.*)$/);
    if (!m) throw new Error('無効なデータURLです');
    const contentType = m[1];
    const b64 = m[2];
    const bytes = Utilities.base64Decode(b64);
    const blobName = filename || ('photo_' + new Date().getTime());
    const blob = Utilities.newBlob(bytes, contentType, blobName);

    // Target folder (指定されたフォルダに保存)
    const folderId = '13eYmubAX8o8jsinZe2MpAXQfXHELmxKA';
    const folder = DriveApp.getFolderById(folderId);
    const file = folder.createFile(blob);

    Logger.log(`[uploadPhoto] saved fileId=${file.getId()} name=${file.getName()}`);
    return { status: 'ok', id: file.getId() };
  } catch (err) {
    Logger.log(`[uploadPhoto] エラー: ${err}`);
    return { status: 'error', message: String(err) };
  }
}
