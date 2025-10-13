test.skip('demoWriteA1 が A1 に テスト を書き込む', () => {
  // 事前確認（空）
  const before = SpreadsheetApp.openById('demo').getSheetByName('Sheet1').getRange('A1').getValue();
  expect(before).toBeUndefined();

  // 実行
  if (typeof demoWriteA1 === 'function') {
    demoWriteA1();
  } else if (typeof global.demoWriteA1 === 'function') {
    global.demoWriteA1();
  } else {
    throw new Error('demoWriteA1 が見つかりません (.gs/.js 読み込み対象を確認)');
  }

  // 検証
  const after = SpreadsheetApp.openById('demo').getSheetByName('Sheet1').getRange('A1').getValue();
  expect(after).toBe('テスト');
});


