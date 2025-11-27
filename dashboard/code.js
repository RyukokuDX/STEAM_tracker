// Code.gs
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
if (!SPREADSHEET_ID) {
  throw new Error(
    "SPREADSHEET_ID script property is not set. Please set it in the Apps Script dashboard under Project Settings > Script Properties."
  );
}

const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
const sn = "管理シート";
const archiveSheetName = "アーカイブ用シート";

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

function completeRows(rowNumbers) {
  if (!Array.isArray(rowNumbers)) {
    throw new Error('行は列番号の配列で指定してください。');
  }

  const targetRows = [...new Set(rowNumbers.map(Number))]
    .filter((row) => Number.isInteger(row) && row > 1)
    .sort((a, b) => a - b);

  if (!targetRows.length) {
    throw new Error('選択されたデータ行がありません。');
  }

  const sourceSheet = ss.getSheetByName(sn);
  const archiveSheet = ss.getSheetByName(archiveSheetName);

  if (!archiveSheet) {
    throw new Error(`シート "${archiveSheetName}" が見つかりません。`);
  }

  const lastColumn = sourceSheet.getLastColumn();
  const rowData = targetRows.map((row) => sourceSheet.getRange(row, 1, 1, lastColumn).getValues()[0]);

  if (!rowData.length) {
    throw new Error('アーカイブするデータが見つかりません。');
  }

  const archiveStartRow = archiveSheet.getLastRow() + 1;
  const columnCount = rowData[0].length;
  archiveSheet.getRange(archiveStartRow, 1, rowData.length, columnCount).setValues(rowData);

  targetRows
    .sort((a, b) => b - a)
    .forEach((row) => {
      sourceSheet.deleteRow(row);
    });

  return { archivedRows: rowData.length };
}