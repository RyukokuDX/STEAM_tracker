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

// スプレッドシート上の日付を確認し、一致する日付であればメッセージ送信
function handoverDayRemind() {
  const data = SHEET.getDataRange().getValues();

  // 登録者全員のデータ確認
  for (let i = 1; i < data.length; i++) 
  {
    // メッセージに使用する要素
    const email = data[i][EMAIL];
    const name = data[i][NAME];
    const organ = data[i][ORGANIZATION];
    const handoverDay = data[i][DAYS_UNTIL_HANDOVER];

    let isSuccess = 0; // メール送信成功フラグ

    // 明け渡し日の判定
    if (handoverDay > 3 || handoverDay === 2 || handoverDay === 1) continue;
    else if (handoverDay === 3) 
    {
      const text = "[リマインド]" + organ + "の" + name + "さんの明け渡し日まであと3日です。";
      const subject = "STEAMコモンズ 明け渡し3日前リマインド通知";
      const body = name + "さん\n明け渡し3日前となりました。";
      Logger.log(text);

      isSuccess = sendEmail(email, subject, body);
      sendLineMessage(USER_ID, text, isSuccess);
    } 
    else if (handoverDay === 0)
    {
      const text = "[リマインド]" + organ + "の" + name + "さんの明け渡し当日です。";
      const subject = "STEAMコモンズ 明け渡し当日リマインド通知";
      const body = name + "さん\n明け渡し当日となりました。";
      Logger.log(text);
      isSuccess = sendEmail(email, subject, body);
      sendLineMessage(USER_ID, text, isSuccess);
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
    return 1;
  }
}

// LINE Messaging APIでメッセージを送信
function sendLineMessage(to, text, isSuccess) {
  const url = 'https://api.line.me/v2/bot/message/push';
  if (isSuccess === 1) {
    text += "\n（メール送信に失敗しました。）";
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
