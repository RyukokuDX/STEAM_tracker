// Code.gs
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
if (!SPREADSHEET_ID) {
  throw new Error(
    "SPREADSHEET_ID script property is not set. Please set it in the Apps Script dashboard under Project Settings > Script Properties."
  );
}
const DOMAIN = 'mail.ryukoku.ac.jp'; // ドメインチェック用
const LOCK_TIMEOUT_MS = 30000; // 30秒
const MAX_NAME_LENGTH = 50;    // 氏名の最大文字数

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

/**
 * テンプレートから他ファイル内容を取り込むためのユーティリティ
 * 例: <style><?!= include('style'); ?></style>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

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

// /**
//  * メールアドレスを取得し、ドメインをチェック
//  * @returns {Object} {email: string, error: string}
//  */
// function getVerifiedEmail() {
//   try {
//     const email = Session.getActiveUser().getEmail();
//     if (!email) {
//       Logger.log("[認証エラー] メールアドレスの取得に失敗");
//       return {
//         error: "認証に失敗しました。ブラウザを再読み込みして再度サインインしてください。"
//       };
//     }
//     if (!email.endsWith('@' + DOMAIN)) {
//       Logger.log(`[認証エラー] 無効なドメイン: ${email}`);
//       return {
//         error: `このフォームは ${DOMAIN} ドメインのみ利用できます。`
//       };
//     }
//     return { email };
//   } catch (err) {
//     Logger.log(`[認証エラー] 例外発生: ${err}`);
//     return {
//       error: "認証中にエラーが発生しました。ブラウザを再読み込みしてお試しください。"
//     };
//   }
// }

/**
 * フォームを表示
 * X-Frame-Options: SAMEORIGIN で埋め込み制限（セキュリティ対策）
 */
function doGet(e) {
  // メールドメイン制限は一時停止中
  // const auth = getVerifiedEmail();
  // if (auth.error) {
  //   return HtmlService.createHtmlOutput(auth.error)
  //     // モバイル端末でエラーメッセージを適切に表示するためのviewport設定を追加
  //     .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover')
  //     .setTitle('アクセス拒否');
  // }

  const tpl = HtmlService.createTemplateFromFile('index');
  const now = new Date();
  const tz = Session.getScriptTimeZone();
  tpl.fiscalEndStr = Utilities.formatDate(getFiscalYearEnd(now), tz, "yyyy-MM-dd");
  tpl.todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  // NOTE: Apps Script HTML templates evaluate scriptlets even inside HTML comments.
  // index.html contains commented-out `<?= email ?>` / `<?= domain ?>` placeholders,
  // so define safe defaults to avoid ReferenceError when domain auth is disabled.
  tpl.email = '';
  // tpl.email = auth.email;
  tpl.domain = DOMAIN;

  // Avoid calling setXFrameOptionsMode because some GAS runtimes may not
  // expose the XFrameOptionsMode enum (leading to a null 'mode' error).
  // If you need to change framing behavior, set it in the Apps Script
  // deployment settings or use the explicit ALLOWALL value if available.
  return tpl.evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover')
    .setTitle("物品登録フォーム");
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

  const email = (payload.email || "").trim();
  const emailLower = email.toLowerCase();
  if (!email) {
    return {
      status: "error",
      message: "メールアドレスは必須です"
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      status: "error",
      message: "メールアドレスの形式が不正です"
    };
  }

  // ドメインチェック
  if (!emailLower.endsWith('@' + DOMAIN.toLowerCase())) {
    return {
      status: "error",
      message: `学内のメールアドレス（@${DOMAIN}）のみ利用可能です`
    };
  }

  // 氏名の必須チェックと文字数制限（トリム後で判定）
  const name = (payload.name || "").trim();
  if (name.length === 0) {
    return {
      status: "error",
      message: "氏名は必須です"
    };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return {
      status: "error",
      message: `氏名は${MAX_NAME_LENGTH}文字以内で入力してください`
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
      email,
      name,
      payload.organization || "",
      payload.photo || "",
      Utilities.formatDate(dateResult.date, tz, "yyyy/MM/dd"),
      "",
      "",
      ""
    ]);

    Logger.log(`[フォーム送信] 成功: ${email}, date=${payload.date}`);

    // 確認メール送信
    const emailSubject = "【STEAMコモンズ】物品登録完了のお知らせ";
    const emailBody = `${name} 様

物品登録フォームからの登録を受け付けました。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 登録内容
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
氏名: ${name}
団体名: ${payload.organization || "（未入力）"}
明け渡し日: ${Utilities.formatDate(dateResult.date, tz, "yyyy年MM月dd日")}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

明け渡し日までに物品の撤去をお願いいたします。

※このメールは自動送信されています。
※心当たりのない場合は、お手数ですがSTEAMコモンズまでお越しください。

──────────────────────────────
STEAMコモンズ
龍谷大学 瀬田キャンパス 智光館2F
──────────────────────────────
`;
    const emailResult = sendEmail(email, emailSubject, emailBody);
    if (!emailResult.success) {
      return {
        status: "error",
        message: `送信は完了しましたが、確認メールの送信に失敗しました。STEAMコモンズの管理者までお問い合わせください。（理由: ${emailResult.message}）`
      };
    }

    return {
      status: "ok",
      message: `送信完了しました。確認メールを ${email} に送信しました。届かない場合は迷惑メールフォルダをご確認ください。`
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
    
    // 許可する画像 MIME タイプをホワイトリストで明示的に制限する
    const allowedImageTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];
    if (!allowedImageTypes.includes(contentType)) {
      throw new Error('許可されていないファイル形式です。JPEG/PNG/WebP のみアップロード可能です。');
    }

    const b64 = m[2];
    const bytes = Utilities.base64Decode(b64);
    
    // 画像がJPEGなら拡張子を .jpg に強制する（中身と拡張子の不一致を防ぐ）
    let saveName = filename || ('photo_' + new Date().getTime());
    if (contentType === 'image/jpeg') {
      saveName = saveName.replace(/\.[^.]+$/, '') + '.jpg';
    }

    const blobName = saveName;
    const blob = Utilities.newBlob(bytes, contentType, blobName);

    // Target folder (指定されたフォルダに保存)
    const folderId = PropertiesService.getScriptProperties().getProperty('driveFolder_ID');
    if (!folderId) {
      throw new Error(
        "driveFolder_ID script property is not set. Please set it in the Apps Script dashboard under Project Settings > Script Properties."
      );
    }
    const folder = DriveApp.getFolderById(folderId);
    const file = folder.createFile(blob);

    Logger.log(`[uploadPhoto] saved fileId=${file.getId()} name=${file.getName()}`);
    return { status: 'ok', id: file.getId() };
  } catch (err) {
    Logger.log(`[uploadPhoto] エラー: ${err}`);
    return { status: 'error', message: String(err) };
  }
}
