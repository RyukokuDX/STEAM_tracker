// Code.gs
const SPREADSHEET_ID = "1U3enu3ETOh_seroYmpO95p2yjW2RSUC7WRLyDk1rhs8";
const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
const sn = "管理シート";

const registered = 1;
const email = 2;
const DriveLinkColum = 5;
const handover = 6;
const days_until_handover = 7;

const sh = ss.getSheetByName(sn);

function getSheetData() {
    return sh.getDataRange().getValues();
}

function doGet() {
  const tpl = HtmlService.createTemplateFromFile('index');
  tpl.data = getSheetData();
  tpl.sheetName = sn;
  tpl.registered = registered;
  tpl.mail = email;
  tpl.photo = DriveLinkColum;
  tpl.handover = handover;
  tpl.days = days_until_handover;
  return tpl.evaluate().setTitle("ダッシュボード");
}