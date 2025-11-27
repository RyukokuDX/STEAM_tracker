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

// 年度末の日付を取得
function GetFiscalYearEnd(dateStr) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  let fiscalYear;

  // 1月〜3月の場合、年度開始年は前年
  if (month >= 4) fiscalYear = year + 1;
  else fiscalYear = year;

  return `${fiscalYear}-03-31`;
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
        maxDate: GetFiscalYearEnd(data[i][HANDOVER_ON]),
        image: `https://lh3.googleusercontent.com/d/${data[i][PHOTO_FILE_ID]}`,
      });
    }
  }
  
  return results;
}

// 延長申請をLineに送信
function NotifyExtensionRequest(results)
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
              url: "https://drive.google.com/uc?export=view&id=" + data[id][PHOTO_FILE_ID],
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
                  text: "延長申請",
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
                  color: "#AA0000",
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

// 延長申請の許可
function ApproveRequest(id, newDate) {
  Logger.log(`延長申請を許可: ${id} 行目、${newDate} まで`);
  SHEET.getRange(id + 1, HANDOVER_ON + 1).setValue(newDate);

  // 申請者情報取得
  const data = SHEET.getDataRange().getValues();
  const email = data[id][EMAIL];
  const name = data[id][NAME];
  const organ = data[id][ORGANIZATION];

  // 申請者にメール送信
  const subject = `STEAMコモンズ 延長申請許可通知`;
  const body = `${name}さん（${organ}）\n\n延長申請が許可されました。\n新しい明け渡し日: ${newDate}`;
  sendEmail(email, subject, body);
   
  sendLineMessage(USER_ID, `延長を ${newDate} まで許可しました。`);
}

// 延長申請の却下
function RejectRequest(id) {
  Logger.log(`延長申請を却下: ${id} 行目`);

  // 申請者情報取得
  const data = SHEET.getDataRange().getValues();
  const email = data[id][EMAIL];
  const name = data[id][NAME];
  const organ = data[id][ORGANIZATION];

  // 申請者にメール送信
  const subject = `STEAMコモンズ 延長申請拒否通知`;
  const body = `${name}さん（${organ}）\n\n延長申請が却下されました。\n`;
  sendEmail(email, subject, body);

  sendLineMessage(USER_ID, `延長申請を却下しました。`);
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
    // Jsonに変換
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
          ApproveRequest(Number(params.id), params.date);
        } else if (params.action === 'reject' && params.id) {
          RejectRequest(Number(params.id));
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