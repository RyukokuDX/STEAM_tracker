const sheetID = SpreadsheetApp.openById("REDACTED_SPREADSHEET_ID");
const sheet = sheetID.getSheetByName("シート1");

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
        GmailApp.sendEmail("example001@mail.ryukoku.ac.jp", "スチームコモンズの物品撤去日について", "スチームコモンズコモンズに預けられている物品の撤去日まで、あと" + diffDays + "日です。延長を申請する場合は、以下のFormに回答してください。");
      }
    }
  }
}