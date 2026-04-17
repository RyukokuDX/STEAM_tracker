# LINE通知の問題点調査報告

- 調査日: 2026-04-17
- 調査ブランチ: `fix/line-notification-regressions`
- 対象コード: `line_bot/GAS/code.js`（`origin/develop` 時点）
- 対象仕様: `docs/SPECIFICATIONS.md`、`docs/LINE_BOT_SPECIFICATION.md`

---

## 1. 概要

LINE通知の挙動を確認した結果、**過去に修正済みだった以下の2件の P0 バグが PR #83 のマージで巻き戻っている**ことが判明した。

- PR #76 の修正（`handoverDay` の数値化）が消失 → リマインド通知が発火しない
- PR #78 の修正（必須 script properties の起動時検証）が消失 → 未設定時に原因不明な例外

本 PR はこの2件を復元することを目的とする。未実装機能（`extendRequestNotify`、年度末一斉通知、再試行ロジックなど）は scope 外とし、後続 PR で対応する。

---

## 2. リグレッションの経緯

| PR | 日付 | 内容 | 対象ファイル |
| :-- | :-- | :-- | :-- |
| #76 | 2026-04-03 | `handoverDay` を `Number()` で数値化し型揺れを吸収 | `line_bot/code.js` |
| #78 | 2026-04-03 | `getRequiredProperty(key)` を導入し起動時検証 | `line_bot/code.js` |
| **#83** | **2026-04-17** | **フォーム公開方法変更に伴い `line_bot/code.js` → `line_bot/GAS/code.js` に移動** | **line_bot ディレクトリ全体** |

PR #83 はファイル移動（rename）を伴う大規模な変更で、移動先のファイル内容が #76/#78 適用前の状態で書き直されているため、修正が失われた。

---

## 3. 復元する修正内容

### 3.1 `handoverDay` の数値化（#76 相当）

`DAYS_UNTIL_HANDOVER` 列には文字列値（例: `"3日"` の名残や、数式計算結果の `number` / `string` 混在）が格納される可能性がある。strict equality (`!==`) で比較するとリマインド条件に一致せず、通知が一度も発火しない。

**Before**
```js
const handoverDay = data[i][DAYS_UNTIL_HANDOVER];
if (handoverDay !== 3 && handoverDay !== 0) continue;
```

**After**
```js
const handoverDay = Number(data[i][DAYS_UNTIL_HANDOVER]);
if (handoverDay !== 3 && handoverDay !== 0) continue;
```

`Number("3日")` は `NaN` になるので、`"3日"` 形式で保存されていた場合は通知されない点は残る。ただしこれは `handoverDay` 列を数値として運用するという仕様合意（#76 時点）に基づく。文字列形式のまま扱うべきなら別途議論が必要。

### 3.2 script properties の起動時検証（#78 相当）

`ACCESS_TOKEN` などが未設定の場合、現状では `null` が `SpreadsheetApp.openById(null)` 等に渡り、原因が分かりにくい例外で停止する。

**Before**
```js
const ACCESS_TOKEN = scriptProperties.getProperty('ACCESS_TOKEN');
const USER_ID = scriptProperties.getProperty('USER_ID');
// ... (未設定なら null)
```

**After**
```js
function getRequiredProperty(key) {
  const value = scriptProperties.getProperty(key);
  if (value === null || value === '') {
    throw new Error(`${key} script property is not set. Please set it in Project Settings > Script Properties.`);
  }
  return value;
}

const ACCESS_TOKEN = getRequiredProperty('ACCESS_TOKEN');
const USER_ID = getRequiredProperty('USER_ID');
// ...
```

併せてシート存在チェックも追加：

```js
const SHEET = SPREAD_SHEET.getSheetByName(SHEET_NAME_MANAGE);
if (!SHEET) {
  throw new Error(`シート "${SHEET_NAME_MANAGE}" が見つかりません。`);
}
```

---

## 4. scope 外とした問題（後続 PR で対応すべき）

リグレッション復元と独立したバグ・未実装機能。優先度別に記録する。

### P1（品質改善）
| 項目 | 現状 | 期待 |
| :-- | :-- | :-- |
| `sendLineMessage` の `mailFailLog` null 参照 | L164: `mailFailLog && mailFailLog.success` でガード済（#83時点で対応） | ✅ 既に修正済み |
| HTTPステータスコードの未検査 | L184-196 で検査済 | ✅ 既に修正済み |
| `muteHttpExceptions` 設定の不一致 | `sendLineMessage` 未指定 / `sendLinePushObject` true | 片方に統一すべき |
| Drive 画像の共有設定 | `getFileById().setSharing(...)` 未実装 | 登録時または通知前に anyone-with-link へ |
| トリガー順序への暗黙依存 | `handoverDayRemind` が更新済み列を前提 | 関数内で HANDOVER_ON から都度計算 |

### P2（未実装機能 / 仕様との乖離）
`docs/LINE_BOT_SPECIFICATION.md` に定義されているが未実装：
- `extendRequestNotify`（延長申請通知）
- 年度末一斉通知
- 通知失敗時の自動再試行
- 再試行失敗時の管理者への通知
- 不正申請・データ検出時の管理者通知

### P3（コード整理）
- L57: `for  ( let  i  =  1 ;  i  < data.length;  i ++ )` の余分な空白
- URL 文字列のハードコード（LINE Push API エンドポイント）を定数化
- スプレッドシートの「送信失敗」列更新（`SPECIFICATIONS.md` §6）が未実装

---

## 5. 検証方法

ローカルで GAS 実機テストはできないため、以下を確認する：
1. `line_bot/GAS/code.js` の syntax が壊れていないこと（`node --check` 相当は GAS 固有 API のため不可、目視レビュー）
2. レビュアーが LINE 側で手動で実行し、`handoverDayRemind` がスプレッドシート値 `3` または `0` の行で通知を発火することを確認
3. script property を1つ削除してプロジェクト再読込し、明示的なエラーメッセージで停止することを確認
