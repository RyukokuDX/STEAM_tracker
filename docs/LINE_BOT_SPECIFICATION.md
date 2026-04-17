# LINE Bot仕様書

## 1. 目的
本Botは、スチームコモンズ物品管理システムの運用補助を目的とし、管理者のみが利用する通知・申請管理Botです。

実装は2モジュールに分かれている。

| モジュール | 責務 |
| :-- | :-- |
| `line_bot/GAS/code.js` | 新規登録通知、明け渡し日リマインド |
| `extend_form/GAS/code.js` | 延長申請通知、LINE Webhook（postback）受信、申請の許可/却下 |

## 2. 主な機能

| 関数 | 実装モジュール | 用途 |
| :-- | :-- | :-- |
| `handoverDayRemind` | `line_bot/` | スプレッドシート上の `DAYS_UNTIL_HANDOVER` 列を確認し、3日前・当日の登録に対してメール（登録者宛）と LINE（管理者宛）を送信する。時間主導トリガーから起動 |
| `registerNotify` | `line_bot/` | 物品登録の管理者向け LINE 通知。`stuffForm/` から `doPost` 経由で呼ばれる |
| `notifyExtensionRequest` | `extend_form/` | 延長申請の管理者向け LINE 通知。許可/却下ボタン付きの Flex Message を送信 |
| `approveRequest` / `rejectRequest` | `extend_form/` | LINE postback から呼ばれ、申請の許可/却下処理と利用者へのメール送信を行う |
| `sendLineMessage` | 両モジュール | テキストメッセージ送信のラッパ（`sendLinePushObject` を呼ぶ） |
| `sendLinePushObject` | 両モジュール | LINE Push API 本体。HTTPステータス検査 + 最大3回の指数バックオフリトライ |
| `handleLineWebhook` | `extend_form/` | LINE Webhook（postback イベント）を受信し、`approveRequest` / `rejectRequest` にディスパッチ |

## 3. 利用者と権限

| 役割       | 主な操作・権限                       |
|:-----------|:-------------------------------------|
| 管理者     | 申請承認/否認、通知送信、履歴確認     |

## 4. メッセージ仕様

- **物品登録時**：管理者に「新規物品登録通知」（画像付き Flex Message）
- **明け渡し日3日前・当日**：管理者に「リマインダー通知」（テキスト）
  - 同時に登録者（利用者）には Gmail でリマインドメールを送信
  - メール送信失敗時は LINE メッセージにその旨を付記する
- **延長申請時**：管理者に「延長申請通知」（画像 + 許可/却下ボタンの Flex Message）
  - postback データ `action=approve|reject&id={id}&date={newDate}` で処理を分岐
- **年度末**：管理者に「一斉通知」（**未実装**）

## 5. 技術構成

- LINE Messaging API（Push API + Webhook）
- Google Apps Script（GAS）
- Apps Script（GAS）で作成した独自フォーム / スプレッドシート連携
- script properties で機密情報（`ACCESS_TOKEN`、`USER_ID`、`LINE_WEBHOOK_TOKEN` 等）を管理

## 6. エラー・例外処理

### 実装済み

- **通知失敗時の自動再試行**: `sendLinePushObject` 内で最大3回、指数バックオフ（1秒→2秒→4秒）。4xx はリトライせず即時失敗、5xx・ネットワーク例外は再試行。戻り値 `{success, message}` で呼び出し元に伝播する。
- **script properties 未設定の検出**: `getRequiredProperty` で起動時に明示的に throw する。
- **入力検証**: `notifyExtensionRequest` / `approveRequest` / `rejectRequest` で `id` の整数性・範囲、`newDate` の `YYYY-MM-DD` regex を検証。
- **Webhook 認証**: `extend_form/` の `isValidLineWebhookToken` で `LINE_WEBHOOK_TOKEN` による検証（未設定時はスキップ）。

### 未実装

- **再試行失敗時の管理者エスカレーション**: `sendLinePushObject` が最終的に失敗した場合、別チャネル（メール等）で通知する上位ハンドラ。
- **不正な申請・データ検出時の通知**: 現状は Logger.log のみ。管理者への能動的な通知は未実装。
- **LINE_WEBHOOK_TOKEN 未設定時の警告**: 未設定だと検証がスキップされるため、起動時に警告すべき（現状は Logger.log のみ）。
