// Code.gs
const SPREADSHEET_ID = "1U3enu3ETOh_seroYmpO95p2yjW2RSUC7WRLyDk1rhs8";
const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
const sh = ss.getSheetByName("シート1"); 

function getSheetData() {
    return sh.getDataRange().getValues();
}

function doGet() {
  const tpl = HtmlService.createTemplateFromFile('index');
  tpl.data = getSheetData();
  return tpl.evaluate().setTitle("ダッシュボード");
}