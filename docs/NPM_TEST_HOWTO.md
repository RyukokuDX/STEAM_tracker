## npm test 実行手順（GAS サブプロジェクト）

このプロジェクトでは、Google Apps Script（GAS）用ローカルテスト環境を `GAS/` 配下に構成しています。テストは Jest を使用し、GAS のサービス（`SpreadsheetApp` など）はモックで擬似化します。

### ディレクトリ構成（抜粋）

- `GAS/`
  - `package.json` … テスト実行のための npm 設定
  - `jest.config.js` … Jest 設定（`tests/setup-gas.js` を参照）
  - `コード.js` … テスト対象の GAS コード
  - `tests/`
    - `setup-gas.js` … モック注入 → GAS コード読み込み
    - `__mocks__/google-apps-script.js` … GAS API のインメモリモック
  - `__tests__/` … Jest テスト

### 前提

- npm, claspを導入済み
  - WSLの場合は、npmの実行にI/O関連で遅延が発生する場合があります。この場合はPS（PowerShell）を使用してください。
- 依存（Jest など）は `GAS/package.json` に定義

### 0) 導入（初回のみ）

`GAS/` ディレクトリでテスト用依存を導入します。

```bash
cd GAS
npm i -D jest gas-local
```

その後、必要に応じて通常の依存解決を行います。

```bash
npm install
```

### 基本コマンド

1. 実行ディレクトリを `GAS/` に移動

```bash
cd GAS
```

2. テストを実行

```bash
npm test
```

### 何が実行されるか

- `GAS/jest.config.js` の `setupFiles` で `GAS/tests/setup-gas.js` を読み込みます。
- `setup-gas.js` は次を行います。
  - GAS API モック（`tests/__mocks__/google-apps-script.js`）をグローバルへ注入
  - `GAS/コード.js` を `require` で読み込み（グローバル関数として利用可能）
- `GAS/__tests__/*.test.js` が Jest により実行されます。

### モックの仕様（要点）

- `SpreadsheetApp.openById(id).getSheetByName(name).getRange('A1')`
  - `getValue()` / `setValue(value)` をサポート
  - 値はインメモリに保持（実際のスプレッドシートには書き込まれません）
- 必要な API が増えたら `tests/__mocks__/google-apps-script.js` にメソッドを追加してください。

### テスト例（サンプル）

```javascript
// GAS/__tests__/spreadsheet.mock.test.js
test('A1 に "テスト" を書き込み/読み出しできる', () => {
  const ss = SpreadsheetApp.openById('book1');
  const sheet = ss.getSheetByName('Sheet1');
  const a1 = sheet.getRange('A1');
  a1.setValue('テスト');
  expect(a1.getValue()).toBe('テスト');
});
```

### よくある質問（FAQ）

- Q: 実際のスプレッドシートはどこに作成されますか？
  - A: テストはモックであり、実シートは作成しません。実環境での検証は `clasp run --function <関数名>` などで行ってください。

- Q: ルート（リポジトリ直下）で `npm test` が動きません。
  - A: 本構成では `GAS/` をサブプロジェクトとして運用しています。`cd GAS && npm test` を実行してください。

### トラブルシュート

- `Error: Can't find a root directory while resolving a config file path.`
  - `GAS/` 内にいるか確認し、`GAS/jest.config.js` が存在するか確認
- `TypeError: xxx is not a function`（モック不足）
  - その API を `tests/__mocks__/google-apps-script.js` に追加

### 補足

- 将来的にルートへ統合する場合は、ルートに `package.json`/`jest.config.js` を置き、`setupFiles` のパスを調整してください。

## 新しい関数を追加した際のテスト方法

1) 関数を追加（例: `GAS/コード.js` または `GAS/code.gs` にトップレベル関数を定義）

```javascript
// 例: GAS/コード.js
function helloName(name) {
  return `Hello, ${name}!`;
}
```

2) 必要なモックを追加（GAS API を使う場合のみ）
- `GAS/tests/__mocks__/google-apps-script.js` に不足しているメソッドを追記
- 例: `SpreadsheetApp.getActiveSpreadsheet()` を使うなら、その戻り値や `getSheetByName` などを追加

3) テストファイルを作成
- 場所: `GAS/__tests__/helloName.test.js`（命名は任意だが `*.test.js` 推奨）

```javascript
test('helloName は挨拶文を返す', () => {
  // .gs/.js はテスト起動時に読み込まれ、トップレベル関数は global に載る
  const fn = global.helloName || helloName;
  expect(fn('GAS')).toBe('Hello, GAS!');
});
```

4) 実行

```bash
cd GAS
npm test
```

5) よくある注意点
- `.gs` でも `.js` でもOK（テスト起動時に読み込まれます）
- トップレベル関数として定義（`var/let/const` に無名関数を代入しないほうが無難）
- GAS API 利用時は必ずモックを拡張（未定義だと `xxx is not a function` になります）

### WSL から PowerShell の npm を呼ぶ設定（ユーザー名を含めない例）

`~/.bashrc` に次を追記し、ユーザーディレクトリは `$env:USERPROFILE` を使うか固定値（ユーザー名）を利用して下さい

```bash
# Windows の Node/NPM/NPX/CLASP を WSL から実行（PowerShell 経由）
alias claspwin='powershell.exe -NoProfile -Command '\''$env:Path="C:\\Program Files\\nodejs;" + ("$env:USERPROFILE\\AppData\\Roaming\\npm;") + $env:Path; clasp'\''' 
alias npmwin='powershell.exe -NoProfile -Command '\''$env:Path="C:\\Program Files\\nodejs;" + ("$env:USERPROFILE\\AppData\\Roaming\\npm;") + $env:Path; npm'\''' 
alias npxwin='powershell.exe -NoProfile -Command '\''$env:Path="C:\\Program Files\\nodejs;" + ("$env:USERPROFILE\\AppData\\Roaming\\npm;") + $env:Path; npx'\''' 

# 反映
source ~/.bashrc
```

動作確認:

```bash
claspwin -v
npmwin -v
npxwin -v
```