const SHEET_ID = SpreadsheetApp.openById("1U3enu3ETOh_seroYmpO95p2yjW2RSUC7WRLyDk1rhs8");
const SHEET = SHEET_ID.getSheetByName("シート1");
const ACCESS_TOKEN = '';
const USER_ID = '';

// 列要素
const RESISTERED_AT = 0;        // フォーム送信時刻（自動記録）
const EMAIL = 1;                // 登録者メール
const NAME = 2;                 // 登録者氏名
const ORGANIZATION = 3;         // 団体名
const PHOTO_FILE_ID = 4         // Drive ファイル ID
const HANDOVER_ON = 5;          // 明け渡し日（YYYY-MM-DD）
const DAYS_UNTIL_HANDOVER = 6;  // 明け渡し日までの日数（計算列） 
const STATUS = 7;               // active / archived / pending
const ADMIN_NOTE = 8;           // 管理者備考

// スプレッドシート上の日付を確認し、一致する日付であればメッセージ送信
function handoverDayRemind() {
  const data = SHEET.getDataRange().getValues();

  // 登録者全員のデータ確認
  for (let i = 1; i < data.length; i++) 
  {
    // メッセージに使用する要素
    const name = data[i][NAME];
    const organ = data[i][ORGANIZATION];
    const handoverDay = data[i][DAYS_UNTIL_HANDOVER];

    // 明け渡し日の判定
    if (handoverDay > 3) continue;
    else if (handoverDay == 3) 
    {
      const text = "[リマインド]" + organ + "の" + name + "さんの明け渡し日まであと3日です。";
      Logger.log(text);
      //sendLineMessage(USER_ID, text);
    } 
    else if (handoverDay == 0)
    {
      const text = "[リマインド]" + organ + "の" + name + "さんの明け渡し当日です。";
      Logger.log(text);
      //sendLineMessage(USER_ID, text);
    }
    else 
    {
      Logger.log("例外が発生しました。  "); 
      return 1;
    }
  }
}

// 物品登録の通知
function registerNotify()
{
  // メッセージに使用する要素
  const name = "";
  const organ = "";
  
  const text = "[物品登録]" + organ + "の" + name + "さんが物品を登録しました。";
  sendLineMessage(USER_ID, text);
}

// 延長申請の通知
function extendRequestNotify()
{
  // メッセージに使用する要素
  const name = "";
  const organ = "";

  const text = "[延長申請]" + organ + "の" + name + "さんが延長を申請しました。\n "
                + "こちらのフォームから延長を承認してください。\n"
                + "（フォームのURL添付）";
  sendLineMessage(USER_ID, text);
}

// 

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



/* 
function onFormSubmit(e) {
  const responses = e.response.getItemResponses();
  const writeRow = sheet.getLastRow()+1;

  const email = e.response.getRespondentEmail();
  const name = responses[0].getResponse();
  const information = responses[1].getResponse();
  const photo = DriveApp.getFileById(responses[2].getResponse());
  const day = responses[3].getResponse();

  sheet.getRange(writeRow, 1).setValue(email);
  sheet.getRange(writeRow, 2).setValue(name);
  sheet.getRange(writeRow, 3).setValue(information);
  sheet.getRange(writeRow, 4).setValue(photo);
  sheet.getRange(writeRow, 5).setValue(day);
}

function dayBetween(day1, day2) {
  const oneDay = 1000*60*60*24;
  const diff = day1.getTime() - day2.getTime();
  return Math.floor((diff/oneDay)+1);
}

function reminder() {
  const today = new Date();

  for(i=0; i<sheet.getLastRow(); i++) {
    const targetDate = new Date(sheet.getRange(i+1, 5).getValue());
    if(targetDate) {
      const diffDays = dayBetween(targetDate, today);
      if(diffDays == 0) {
        sheet.getRange(i+1, 6).setValue("今日まで");
      }else{
        sheet.getRange(i+1, 6).setValue(diffDays + "日");
      }
      
      if(diffDays == 0 || diffDays == 3) {
        GmailApp.sendEmail("y240152@mail.ryukoku.ac.jp", "スチームコモンズの物品撤去日について", "スチームコモンズコモンズに預けられている物品の撤去日まで、あと" + diffDays + "日です。延長を申請する場合は、以下のFormに回答してください。");
      }
    }
  }
}

*/