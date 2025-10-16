test('A1 に "テスト" を書き込み/読み出しできる', () => {
  const ss = SpreadsheetApp.openById('book1');
  const sheet = ss.getSheetByName('Sheet1');
  const a1 = sheet.getRange('A1');
  a1.setValue('テスト');
  expect(a1.getValue()).toBe('テスト');
});



