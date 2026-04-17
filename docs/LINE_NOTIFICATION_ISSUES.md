# LINE通知の問題点調査報告と改良

- 調査日: 2026-04-17
- 調査ブランチ: `claude/fix/line-notification-regressions`
- 対象コード: `line_bot/GAS/code.js`、`extend_form/GAS/code.js`（`origin/develop` 時点）
- 対象仕様: `docs/SPECIFICATIONS.md`、`docs/LINE_BOT_SPECIFICATION.md`、`docs/EXTEND_FORM_SPECIFICATION.md`

---

## 1. 概要

LINE通知の挙動を確認した結果、**過去に修正済みだった以下の2件の P0 バグが PR #83 のマージで巻き戻っている**ことが判明した。

- PR #76 の修正（`handoverDay` の数値化）が消失 → リマインド通知が発火しない
- PR #78 の修正（必須 script properties の起動時検証）が消失 → 未設定時に原因不明な例外

本 PR はこの2件の復元に加え、**発見された他の品質上の問題も併せて改良する**。未実装機能（年度末一斉通知、アーカイブ処理など）は scope 外とし、後続 PR で対応する。

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

## 4. 併せて実施した改良

リグレッション復元と合わせて、以下の品質問題にも本 PR で対応した。

### 4.1 `extend_form/GAS/code.js` にも起動時検証を導入

`line_bot` と同じ `getRequiredProperty()` と SHEET 存在チェックを `extend_form` にも展開。両モジュールで挙動を統一。

### 4.2 `sendLinePushObject` の品質統一とリトライ導入（両モジュール）

`extend_form` 側の `sendLinePushObject` は HTTPステータス未検査・返り値なしで、呼び出し元が失敗を検知できなかった。これを `line_bot` と同じ形に揃え、さらに **両モジュールに最大3回の指数バックオフリトライ**（1秒 → 2秒 → 4秒）を実装した。

- 2xx 成功: `{success: true}` 即座に返却
- 4xx クライアントエラー: リトライせず即時失敗（トークン不正などで無駄な試行を避ける）
- 5xx / ネットワーク例外: 最大3回リトライ後失敗

仕様書 §6「通知失敗時は自動で再試行を行い」に対応。再試行失敗時の管理者通知は「別チャネル（メール等）での通知」となるため、本PRでは `{success:false, message}` の戻り値で呼び出し元に失敗を伝播するに留め、上位での通知ルート整備は後続PRで対応する。

### 4.3 `notifyExtensionRequest` の入力検証を追加

`item.id` と `item.newDate` を LINE メッセージおよび postback data に未検証で埋め込んでいたため、以下の検証を前置：
- `id`: 整数かつ `1 <= id < data.length`
- `newDate`: `YYYY-MM-DD` の正規表現一致

### 4.4 `approveRequest` / `rejectRequest` の引数検証統一

`approveRequest` には id の範囲チェックが無かった。`rejectRequest` 側にあった検証を両方に統一、かつ `id < 0` → `id < 1`（index 0 は見出し行）に修正。

### 4.5 `sendLineMessage` を `sendLinePushObject` の薄いラッパに統一

`line_bot` 側で `sendLineMessage` と `sendLinePushObject` が別々に LINE API を叩いていたため、`sendLineMessage` を `sendLinePushObject` の薄いラッパに変更。リトライロジックを一箇所に集約。

### 4.6 画像URLを `lh3.googleusercontent.com/d/{id}` に統一

`line_bot/GAS/code.js` の `registerNotify` は `drive.google.com/uc?export=view&id=XXX` を使っていたが、`extend_form` 側が採用している `lh3.googleusercontent.com/d/XXX` のほうが LINE 側から安定的にアクセス可能（リダイレクトが少ない）。両モジュールで統一。

---

## 5. 後続 PR で対応すべき残課題

| 項目 | 優先度 | 備考 |
| :-- | :-- | :-- |
| 年度末一斉通知 | P2 | 仕様書 §4、時間主導トリガー（3月下旬）で全登録者の LINE/メール通知。未実装 |
| 通知失敗時の管理者エスカレーション | P2 | 現状は戻り値で伝播するのみ。上位ハンドラで別チャネル（メール）に通知するルートを追加すべき |
| 不正申請・データ検出時の管理者通知 | P2 | 「不正」の定義から議論が必要 |
| Drive 画像の共有設定を自動化 | P2 | 登録時 or 通知前に `setSharing(ANYONE_WITH_LINK, VIEW)` |
| `handoverDayRemind` のトリガー順序依存 | P2 | `HANDOVER_ON` から現在日との差を都度計算し `DAYS_UNTIL_HANDOVER` 列依存を解消 |
| 共通 LINE/メールヘルパの共通化 | P3 | `line_bot` と `extend_form` の `sendLine*` / `sendEmail` を clasp library で共通化 |
| スプレッドシート「送信失敗」列更新 | P3 | `SPECIFICATIONS.md` §6 |
| コード整理（L57 等の空白） | P3 | |

---

## 5. 検証方法

ローカルで GAS 実機テストはできないため、以下を確認する：
1. `line_bot/GAS/code.js` の syntax が壊れていないこと（`node --check` 相当は GAS 固有 API のため不可、目視レビュー）
2. レビュアーが LINE 側で手動で実行し、`handoverDayRemind` がスプレッドシート値 `3` または `0` の行で通知を発火することを確認
3. script property を1つ削除してプロジェクト再読込し、明示的なエラーメッセージで停止することを確認
