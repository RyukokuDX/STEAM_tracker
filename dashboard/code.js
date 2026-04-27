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
const nameCol = 3;
const DriveLinkColumn = 5;
const handover = 6;
const days_until_handover = 7;
const statusColumn = 8;
const adminNoteColumn = 9;
const STATUS_ACTIVE = 'active';
const STATUS_ARCHIVED = 'archived';
const STATUS_DISCARDED = 'discarded';

/**
 * テンプレートから他ファイル内容を取り込むためのユーティリティ
 * 例: <style><?!= include('style'); ?></style>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * 日付をyyyy/MM/dd形式の文字列に変換
 */
function formatDate(date) {
  if (!(date instanceof Date)) return date;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

function getSheetData() {
  const sh = ss.getSheetByName(sn);
  if (!sh) {
    throw new Error(`Sheet "${sn}" not found in spreadsheet.`);
  }

  const data = sh.getDataRange().getValues();
  // 日付型を文字列に変換
  return data.map(row => row.map(cell => {
    if (cell instanceof Date) {
      return formatDate(cell);
    }
    return cell;
  }));
}

function getArchiveSheetData() {
  const sh = ss.getSheetByName(archiveSheetName);
  if (!sh) {
    throw new Error(`Sheet "${archiveSheetName}" not found in spreadsheet.`);
  }

  const data = sh.getDataRange().getValues();
  // 日付型を文字列に変換
  return data.map(row => row.map(cell => {
    if (cell instanceof Date) {
      return formatDate(cell);
    }
    return cell;
  }));
}

function doGet(e) {
  try {
    // 両方のシートデータを最初に読み込む
    const tpl = HtmlService.createTemplateFromFile('index');
    tpl.data = getSheetData();
    tpl.archiveData = getArchiveSheetData();
    tpl.sheetName = sn;
    tpl.archiveSheetName = archiveSheetName;
    tpl.registered = registered;
    tpl.email = email;
    tpl.name = nameCol;
    tpl.photo = DriveLinkColumn;
    tpl.handover = handover;
    tpl.days = days_until_handover;
    tpl.statusColumn = statusColumn;
    tpl.adminNoteColumn = adminNoteColumn;
    tpl.scriptUrl = ScriptApp.getService().getUrl();
    return tpl.evaluate().setTitle("ダッシュボード");
  } catch (err) {
    return HtmlService.createHtmlOutput(
      'doGet error: ' + (err && err.message ? err.message : err)
    );
  }
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

  targetRows.forEach((row) => {
    sourceSheet.getRange(row, statusColumn).setValue(STATUS_ARCHIVED);
  });

  const lastColumn = sourceSheet.getLastColumn();
  const rowData = targetRows.map((row) => sourceSheet.getRange(row, 1, 1, lastColumn).getValues()[0]);

  if (!rowData.length) {
    throw new Error('撤去済みにするデータが見つかりません。');
  }

  const archiveStartRow = archiveSheet.getLastRow() + 1;
  const columnCount = rowData[0].length;
  archiveSheet.getRange(archiveStartRow, 1, rowData.length, columnCount).setValues(rowData);

  targetRows
    .sort((a, b) => b - a)
    .forEach((row) => {
      sourceSheet.deleteRow(row);
    });

  // 日付をフォーマットして返す
  const formattedRowData = rowData.map(row => row.map(cell => {
    if (cell instanceof Date) {
      return formatDate(cell);
    }
    return cell;
  }));

  return { archivedRows: rowData.length, data: formattedRowData };
}

function discardRows(rowNumbers) {
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

  targetRows.forEach((row) => {
    sourceSheet.getRange(row, statusColumn).setValue(STATUS_DISCARDED);
  });

  const lastColumn = sourceSheet.getLastColumn();
  const rowData = targetRows.map((row) => sourceSheet.getRange(row, 1, 1, lastColumn).getValues()[0]);

  if (!rowData.length) {
    throw new Error('破棄済みにするデータが見つかりません。');
  }

  const archiveStartRow = archiveSheet.getLastRow() + 1;
  const columnCount = rowData[0].length;
  archiveSheet.getRange(archiveStartRow, 1, rowData.length, columnCount).setValues(rowData);

  targetRows
    .sort((a, b) => b - a)
    .forEach((row) => {
      sourceSheet.deleteRow(row);
    });

  // 日付をフォーマットして返す
  const formattedRowData = rowData.map(row => row.map(cell => {
    if (cell instanceof Date) {
      return formatDate(cell);
    }
    return cell;
  }));

  return { archivedRows: rowData.length, data: formattedRowData };
}

function deleteRows(rowNumbers) {
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

  targetRows
    .sort((a, b) => b - a)
    .forEach((row) => {
      sourceSheet.deleteRow(row);
    });
    
  return { deletedRows: targetRows.length };
}

function deleteArchiveRows(rowNumbers) {
  if (!Array.isArray(rowNumbers)) {
    throw new Error('行は列番号の配列で指定してください。');
  }

  const targetRows = [...new Set(rowNumbers.map(Number))]
    .filter((row) => Number.isInteger(row) && row > 1)
    .sort((a, b) => a - b);

  if (!targetRows.length) {
    throw new Error('選択されたデータ行がありません。');
  }

  const archiveSheet = ss.getSheetByName(archiveSheetName);

  if (!archiveSheet) {
    throw new Error(`シート "${archiveSheetName}" が見つかりません。`);
  }

  targetRows
    .sort((a, b) => b - a)
    .forEach((row) => {
      archiveSheet.deleteRow(row);
    });
    
  return { deletedRows: targetRows.length };
}

/**
 * 管理シートの備考欄を更新
 */
function updateAdminNote(rowNumber, note) {
  const row = Number(rowNumber);
  if (!Number.isInteger(row) || row < 2) {
    throw new Error('無効な行番号です。');
  }

  const sourceSheet = ss.getSheetByName(sn);
  if (!sourceSheet) {
    throw new Error(`シート "${sn}" が見つかりません。`);
  }

  sourceSheet.getRange(row, adminNoteColumn).setValue(note);
  
  return { success: true };
}

/**
 * アーカイブシートの備考欄を更新
 */
function updateArchiveAdminNote(rowNumber, note) {
  const row = Number(rowNumber);
  if (!Number.isInteger(row) || row < 2) {
    throw new Error('無効な行番号です。');
  }

  const archiveSheet = ss.getSheetByName(archiveSheetName);
  if (!archiveSheet) {
    throw new Error(`シート "${archiveSheetName}" が見つかりません。`);
  }

  archiveSheet.getRange(row, adminNoteColumn).setValue(note);
  
  return { success: true };
}

/**
 * アーカイブシートから管理シートへ行を戻す
 * status列は空白にする
 */
function restoreRows(rowNumbers) {
  if (!Array.isArray(rowNumbers)) {
    throw new Error('行は列番号の配列で指定してください。');
  }

  const targetRows = [...new Set(rowNumbers.map(Number))]
    .filter((row) => Number.isInteger(row) && row > 1)
    .sort((a, b) => a - b);

  if (!targetRows.length) {
    throw new Error('選択されたデータ行がありません。');
  }

  const archiveSheet = ss.getSheetByName(archiveSheetName);
  const mainSheet = ss.getSheetByName(sn);

  if (!archiveSheet) {
    throw new Error(`シート "${archiveSheetName}" が見つかりません。`);
  }
  if (!mainSheet) {
    throw new Error(`シート "${sn}" が見つかりません。`);
  }

  const lastColumn = archiveSheet.getLastColumn();
  const rowData = targetRows.map((row) => {
    const data = archiveSheet.getRange(row, 1, 1, lastColumn).getValues()[0];
    data[statusColumn - 1] = STATUS_ACTIVE;
    return data;
  });

  if (!rowData.length) {
    throw new Error('戻すデータが見つかりません。');
  }

  // 管理シートに追加
  const mainStartRow = mainSheet.getLastRow() + 1;
  const columnCount = rowData[0].length;
  mainSheet.getRange(mainStartRow, 1, rowData.length, columnCount).setValues(rowData);

  // アーカイブシートから削除（下から削除）
  targetRows
    .sort((a, b) => b - a)
    .forEach((row) => {
      archiveSheet.deleteRow(row);
    });

  // 日付をフォーマットして返す
  const formattedRowData = rowData.map(row => row.map(cell => {
    if (cell instanceof Date) {
      return formatDate(cell);
    }
    return cell;
  }));

  return { restoredRows: rowData.length, data: formattedRowData };
}