const scriptProperties = PropertiesService.getScriptProperties();
function getRequiredProperty(key) {
  const value = scriptProperties.getProperty(key);
  if (!value) {
    throw new Error(`${key} script property is not set.`);
  }
  return value;
}

const ACCESS_TOKEN = getRequiredProperty('ACCESS_TOKEN');
const USER_ID = getRequiredProperty('USER_ID');
const SPREAD_SHEET_ID = getRequiredProperty('SPREAD_SHEET_ID');
const SHEET_NAME_MANAGE = getRequiredProperty('SHEET_NAME_MANAGE');

const SPREAD_SHEET = SpreadsheetApp.openById(SPREAD_SHEET_ID);
const SHEET = SPREAD_SHEET.getSheetByName(SHEET_NAME_MANAGE);
if (!SHEET) {
  throw new Error(`Sheet "${SHEET_NAME_MANAGE}" not found in spreadsheet.`);
}

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

const DOMAIN = 'mail.ryukoku.ac.jp';

// === HTMLフォーム表示 ===
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("延長申請フォーム")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// function doGet() {
//   const auth = getVerifiedEmail();
//   if (auth.error) {
//     Logger.log(auth.email);
//     return HtmlService.createHtmlOutput(auth.error)
//       .setTitle('アクセス拒否');
//   }
 
//   const tpl = HtmlService.createTemplateFromFile('index');
//   tpl.email = auth.email;
//   Logger.log(`認証成功: ${tpl.email}`);
//   return tpl.evaluate()
//     .setTitle("延長申請フォーム");
// }

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

// 年度末の日付を取得
function getFiscalYearEnd(dateStr) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  let fiscalYear;

  // 4月〜12月の場合、年度終了年は翌年
  if (month >= 4) fiscalYear = year + 1;
  else fiscalYear = year;

  return `${fiscalYear}-03-31`;
}

// メールアドレスをもとに物品を取得
function getItemsByEmail(email) {
  const data = SHEET.getDataRange().getValues();
  let results = [];
  
  // 登録データ探索
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][EMAIL]).toLowerCase() === String(email).toLowerCase()) {
      results.push({
        id: i,
        name: data[i][NAME],
        organ: data[i][ORGANIZATION],
        handover: Utilities.formatDate(new Date(data[i][HANDOVER_ON]), "Asia/Tokyo", "yyyy-MM-dd"),
        maxDate: GetFiscalYearEnd(data[i][HANDOVER_ON]),
        image: `https://lh3.googleusercontent.com/d/${data[i][PHOTO_FILE_ID]}`,
      });
    }
  }
  
  return results;
}

// 延長申請をLineに送信
function notifyExtensionRequest(results)
{
  const data = SHEET.getDataRange().getValues();

  // ボタン付きメッセージの送信
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
                {
                  type: "text",
                  text: `延長申請 No.${id}`,
                  weight: "bold",
                  size: "xl"
                },
                {
                  type: "text",
                  text: `${organ}（${name}）`,
                  size: "md",
                  wrap: true,
                  margin: "md"
                },
                {
                  type: "text",
                  text: `希望延長日：${newDate}`,
                  size: "md",
                  wrap: true,
                  margin: "md"
                }
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

// LINE Messaging APIでメッセージのみ送信
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

// LINE Messaging APIでオブジェクト送信
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

// 延長申請の許可
function approveRequest(id, newDate) {
  // 日付形式の検証
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    Logger.log(`無効な日付形式: ${newDate}`);
    return;
  }
  // 申請者情報取得
  const data = SHEET.getDataRange().getValues();
  Logger.log(`延長申請を許可: ${id} 行目、${newDate} まで`);
  SHEET.getRange(id + 1, HANDOVER_ON + 1).setValue(newDate);
  const email = data[id][EMAIL];
  const name = data[id][NAME];
  const organ = data[id][ORGANIZATION];

  // 申請者にメール送信
  const subject = `STEAMコモンズ 延長申請許可通知`;
  const body = `${name}さん（${organ}）\n\n延長申請が許可されました。\n新しい明け渡し日: ${newDate}\n\n
                このメッセージに心当たりがない場合は、STEAMコモンズまでお越しください。`;
  sendEmail(email, subject, body);
   
  sendLineMessage(USER_ID, `延長申請No.${id}を ${newDate} まで許可しました。`);
}

// 延長申請の却下
function rejectRequest(id) {
  Logger.log(`延長申請を却下: ${id} 行目`);

  // 申請者情報取得
  const data = SHEET.getDataRange().getValues();
  // id の範囲チェック
  if (typeof id !== "number" || id < 0 || id >= data.length) {
    Logger.log(`無効な id: ${id}`);
    return;
  }
  const email = data[id][EMAIL];
  const name = data[id][NAME];
  const organ = data[id][ORGANIZATION];

  // 申請者にメール送信
  const subject = `STEAMコモンズ 延長申請却下通知`;
  const body = `${name}さん（${organ}）\n\n延長申請が却下されました。\n\nこのメッセージに心当たりがない場合は、STEAMコモンズまでお越しください。`;
  sendEmail(email, subject, body);
  sendLineMessage(USER_ID, `延長申請No.${id}を却下しました。`);
}

// メールを送信
function sendEmail(to, subject, body) {
  //Logger.log(Session.getEffectiveUser().getEmail());
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

// LINE Webhook受信（ボタン押下イベント）
function doPost(e) {

  try {
    // JSONに変換
    const json = JSON.parse(e.postData.contents);
    if (!json.events || !Array.isArray(json.events)) return ContentService.createTextOutput('No events');

    // postbackでボタン押下イベントのみ処理
    json.events.forEach(event => {
      if (event.type === 'postback' && event.postback && event.postback.data) {
        // &区切りでデータ分割、=区切りで値を取得
        // 今回の形式：action=approve&id=${id}&date=${newDate}
        const params = {};
        event.postback.data.split('&').forEach(pair => {
          const [key, value] = pair.split('=');
          params[key] = value;
        });

        // 承認/却下
        if (params.action === 'approve' && params.id && params.date) {
          approveRequest(Number(params.id), params.date);
        } else if (params.action === 'reject' && params.id) {
          rejectRequest(Number(params.id));
        }
      }
    });
    return ContentService.createTextOutput('OK');
  } catch (err) {
    Logger.log('Webhook error: ' + err);
    return ContentService.createTextOutput('Error');
  }
}

// 権限取得用
function requestGmailPermission() {
  GmailApp.sendEmail(Session.getActiveUser().getEmail(), "権限テスト", "これは権限確認用のテストです");
}
