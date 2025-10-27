// Code.gs
const SPREADSHEET_ID = "1U3enu3ETOh_seroYmpO95p2yjW2RSUC7WRLyDk1rhs8";
const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
const sh = ss.getSheetByName("シート1");

const c2 = sh.getRange(2, 3).getValue();

function myFunction() {
  //test
}

function doGet() {
  const tpl = HtmlService.createTemplateFromFile('index');
  tpl.name = c2;
  return tpl.evaluate().setTitle("ダッシュボード");
}