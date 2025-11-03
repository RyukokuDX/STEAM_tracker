// Code.gs
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
if (!SPREADSHEET_ID) {
  throw new Error(
    "SPREADSHEET_ID script property is not set. Please set it in the Apps Script dashboard under Project Settings > Script Properties."
  );
}
const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
const sn = "管理シート";

const registered = 1;
const email = 2;
const name = 3;
const DriveLinkColumn = 5;
const handover = 6;
const days_until_handover = 7;

function getSheetData() {
  const sh = ss.getSheetByName(sn);
  if (!sh) {
    throw new Error(`Sheet "${sn}" not found in spreadsheet.`);
  }
  return sh.getDataRange().getValues();
}

function doGet() {
  const tpl = HtmlService.createTemplateFromFile('index');
  tpl.data = getSheetData();
  tpl.sheetName = sn;
  tpl.registered = registered;
  tpl.email = email;
  tpl.name = name;
  tpl.photo = DriveLinkColumn;
  tpl.handover = handover;
  tpl.days = days_until_handover;
  return tpl.evaluate().setTitle("ダッシュボード");
}