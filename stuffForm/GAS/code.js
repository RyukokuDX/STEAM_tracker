// Code.gs

const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
if (!SPREADSHEET_ID) {
  throw new Error(
    "SPREADSHEET_ID script property is not set. Please set it in the Apps Script dashboard under Project Settings > Script Properties."
  );
}
const DOMAIN = 'mail.ryukoku.ac.jp';
const LOCK_TIMEOUT_MS = 30000;
const MAX_NAME_LENGTH = 50;
const LINE_BOT_NOTIFY_URL = PropertiesService.getScriptProperties().getProperty('LINE_BOT_NOTIFY_URL');
const STATUS_ACTIVE = 'active';
const ITEMS_HEADERS = [
  'registered_at',
  'email',
  'name',
  'organization',
  'photo_file_id',
  'handover_on',
  'days_until_handover',
  'status',
  'admin_note'
];

// ============================================================
// doPost: 静的HTMLからのfetchを受け取るエントリーポイント
// actionフィールドで処理を振り分ける
// ============================================================
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    Logger.log('[doPost] action=' + action + ' payload=' + JSON.stringify(payload));

    let result;
    if (action === 'uploadPhoto') {
      result = uploadPhoto(payload.dataUrl, payload.filename);
    } else if (action === 'submitForm') {
      result = submitForm(payload);
    } else {
      result = { status: 'error', message: '不明なアクションです: ' + action };
    }
    Logger.log('[doPost] result=' + JSON.stringify(result));

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('[doPost] エラー: ' + err);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// line_bot Webhookに新規登録通知を送信
// ============================================================
function notifyLineBotNewRegistration(registration) {
  if (!LINE_BOT_NOTIFY_URL) {
    Logger.log('[LINE連携] LINE_BOT_NOTIFY_URL が未設定');
    return { success: false, message: 'LINE_BOT_NOTIFY_URL が未設定です。' };
  }

  const requestBody = {
    action: 'notifyRegistration',
    data: registration
  };

  const options = {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };

  try {
    Logger.log('[LINE連携] request=' + JSON.stringify(requestBody));
    const res = UrlFetchApp.fetch(LINE_BOT_NOTIFY_URL, options);
    const statusCode = res.getResponseCode();
    const text = res.getContentText();
    Logger.log(`[LINE連携] HTTP ${statusCode} body=${text}`);
    if (statusCode < 200 || statusCode >= 300) {
      return { success: false, message: `HTTP ${statusCode}: ${text}` };
    }

    const parsed = text ? JSON.parse(text) : {};
    if (parsed.status !== 'ok') {
      return { success: false, message: parsed.message || 'line_bot がエラーを返しました。' };
    }

    return { success: true, message: '' };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

// ============================================================
// 手動疎通確認用: Apps Script エディタから実行
// ============================================================
function testLineBotNotify() {
  const result = notifyLineBotNewRegistration({
    name: '疎通テスト',
    organization: 'テスト団体',
    photoFileId: 'TEST_FILE_ID'
  });
  Logger.log('[LINE連携テスト] ' + JSON.stringify(result));
  return result;
}

// ============================================================
// メール送信
// ============================================================
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

// ============================================================
// 年度末日を取得 (3月31日基準)
// ============================================================
function getFiscalYearEnd(todayDate) {
  const year = todayDate.getFullYear();
  const thisYearMar31 = new Date(year, 2, 31);
  const normalize = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const t = normalize(todayDate);
  const m = normalize(thisYearMar31);
  if (t > m) return new Date(year + 1, 2, 31);
  return m;
}

// ============================================================
// 日付文字列のバリデーション
// ============================================================
function validateDate(dateStr) {
  if (!dateStr) return { error: "日付が指定されていません" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { error: "日付の形式が不正です (YYYY-MM-DD)" };
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return { error: "無効な日付です" };
  }
  return {
    date: new Date(date.getFullYear(), date.getMonth(), date.getDate())
  };
}

// ============================================================
// フォーム送信処理
// ============================================================
function submitForm(payload) {
  if (!payload) {
    return { status: "error", message: "送信データが空です" };
  }
  Logger.log('[submitForm] start payload=' + JSON.stringify(payload));

  const email = (payload.email || "").trim();
  const emailLower = email.toLowerCase();
  if (!email) {
    return { status: "error", message: "メールアドレスは必須です" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "メールアドレスの形式が不正です" };
  }
  if (!emailLower.endsWith('@' + DOMAIN.toLowerCase())) {
    return { status: "error", message: `学内のメールアドレス（@${DOMAIN}）のみ利用可能です` };
  }

  const name = (payload.name || "").trim();
  if (name.length === 0) {
    return { status: "error", message: "氏名は必須です" };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { status: "error", message: `氏名は${MAX_NAME_LENGTH}文字以内で入力してください` };
  }

  const dateResult = validateDate(payload.date);
  if (dateResult.error) {
    return { status: "error", message: dateResult.error };
  }

  if (!payload.photo || String(payload.photo).trim() === '') {
    return { status: 'error', message: '写真は必須です。' };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const fiscalEnd = getFiscalYearEnd(now);

  if (dateResult.date < now) {
    return { status: "error", message: "過去の日付は選択できません" };
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
      throw new Error("サーバーが混み合っています。しばらく待ってから再度お試しください。");
    }
    locked = true;

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const shName = "管理シート";
    const sh = ss.getSheetByName(shName) || ss.insertSheet(shName);

    if (sh.getLastRow() === 0) {
      sh.appendRow(ITEMS_HEADERS);
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
      STATUS_ACTIVE,
      ""
    ]);

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

    const lineResult = notifyLineBotNewRegistration({
      name,
      organization: payload.organization || '',
      photoFileId: payload.photo || ''
    });
    Logger.log('[submitForm] lineResult=' + JSON.stringify(lineResult));

    let responseMessage = `送信完了しました。確認メールを ${email} に送信しました。届かない場合は迷惑メールフォルダをご確認ください。`;
    if (!lineResult.success) {
      Logger.log(`[フォーム送信] LINE通知失敗: ${lineResult.message}`);
      responseMessage += '\n（管理者向けLINE通知に失敗しました。運用担当者に連絡してください。）';
    }

    return {
      status: "ok",
      message: responseMessage
    };

  } catch (err) {
    Logger.log(`[フォーム送信] エラー: ${err}`);
    return { status: "error", message: err.message || "送信中にエラーが発生しました" };

  } finally {
    if (locked) lock.releaseLock();
  }
}

// ============================================================
// 写真アップロード処理
// ============================================================
function uploadPhoto(dataUrl, filename) {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new Error('アップロードするデータがありません');
    }

    const m = dataUrl.match(/^data:(.+);base64,(.*)$/);
    if (!m) throw new Error('無効なデータURLです');
    const contentType = m[1];

    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedImageTypes.includes(contentType)) {
      throw new Error('許可されていないファイル形式です。JPEG/PNG/WebP のみアップロード可能です。');
    }

    const b64 = m[2];
    const bytes = Utilities.base64Decode(b64);

    let saveName = filename || ('photo_' + new Date().getTime());
    if (contentType === 'image/jpeg') {
      saveName = saveName.replace(/\.[^.]+$/, '') + '.jpg';
    }

    const blob = Utilities.newBlob(bytes, contentType, saveName);

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