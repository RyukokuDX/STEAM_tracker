test('任意のスプレッドシートの A1 に "TeSt" を書き込み/確認する', () => {
  const ss = SpreadsheetApp.openById('any-book');
  const sheet = ss.getSheetByName('Sheet1');
  const a1 = sheet.getRange('A1');
  a1.setValue('TeSt');
  expect(a1.getValue()).toBe('TeSt');
});


