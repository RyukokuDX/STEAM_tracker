global.Logger = { log: () => {} };

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: () => null,
    setProperty: () => {},
  }),
};

// シンプルなインメモリのシート実装
const __sheetsStore = new Map(); // key: `${id}:${sheetName}` -> { cells: Map<a1, value> }

function createSheet() {
  const cells = new Map();
  return {
    // A1 形式でセルを取得（省略時は 'A1'）
    getRange: (a1 = 'A1') => ({
      getValue: () => cells.get(a1),
      setValue: (value) => {
        cells.set(a1, value);
      },
    }),
  };
}

global.SpreadsheetApp = {
  openById: (id = 'default') => ({
    getSheetByName: (name = 'Sheet1') => {
      const key = `${id}:${name}`;
      if (!__sheetsStore.has(key)) {
        __sheetsStore.set(key, createSheet());
      }
      return __sheetsStore.get(key);
    },
  }),
};


