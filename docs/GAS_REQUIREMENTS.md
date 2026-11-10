# GAS 要件・実装仕様書

> 本書は現行実装に準拠する。最終更新: 2026-11-05

このドキュメントは本プロジェクトの Google Apps Script（GAS）プロジェクトの構成・設定・運用をまとめたものです。実装者・運用者が参照することを想定しています。
各機能の動作仕様は `docs/SPECIFICATIONS.md` を参照してください。

---

## 1. GAS プロジェクト一覧

| ディレクトリ | 役割 | 公開形態 |
| --- | --- | --- |
| `stuffForm/GAS/` | 物品登録の受付（写真保存・items への記録・確認メール・登録通知の依頼） | Web アプリ（静的 HTML `stuffForm/index.html` から POST） |
| `line_bot/GAS/` | 明け渡しリマインド、登録通知の LINE 送信 | Web アプリ + 時間主導トリガー |
| `extend_form/GAS/` | 延長申請の受付、LINE Webhook による許可/却下 | Web アプリ（静的 HTML `extend_form/index.html` から POST、LINE Webhook の送信先） |
| `dashboard/` | 管理画面 | Web アプリ（GET） |
| `GAS/` | レガシー試作（本番では使用しない） | ― |

---

## 2. 主要関数

### stuffForm

- `doPost(e)`: `action` で `uploadPhoto` / `submitForm` を振り分ける。
- `uploadPhoto(dataUrl, filename)`: JPEG/PNG/WebP のみ受け付け、Drive（`driveFolder_ID`）に保存してファイル ID を返す。
- `submitForm(payload)`: 入力検証 → items へ追記（`status=active`）→ 確認メール → `notifyLineBotNewRegistration`。
- `notifyLineBotNewRegistration(registration)`: `line_bot` の Web アプリへ `notifyRegistration` を POST する。
- `testLineBotNotify()`: 登録通知の疎通確認（手動実行）。

### line_bot

- `doPost(e)`: `notifyRegistration` を受けて `registerNotify` を呼ぶ。
- `registerNotify(registration)`: 写真・氏名・団体名・明け渡し日を LINE（Flex Message）で管理者へ送る。
- `handoverDayRemind()`: 日次リマインド。F 列（handover_on）から残り日数を算出し、3 日前・当日・期限超過の active 行へ通知する（期限超過は管理者へ 1 日 1 通のまとめ LINE）。
- `setupReminderTrigger()`: `handoverDayRemind` の日次トリガー（9 時台）を作り直す（手動実行）。
- `listReminderTriggers()`: 実行者のアカウントが持つトリガーを一覧表示する（手動実行）。
- `backfillActiveStatus()`: items の status 空欄を `active` で補完する（移行用・手動実行）。
- `sendEmail` / `sendLineMessage` / `sendLinePushObject`: 送信ユーティリティ（LINE は最大 3 回再試行、4xx は再試行しない）。

### extend_form

- `doPost(e)`: `events` があれば LINE Webhook（`handleLineWebhook`）、`action` があれば静的 HTML からのリクエスト（`handleFetchRequest`）として処理する。
- `getItemsByEmail(email)`: メールアドレスが一致し status が active の物品を返す（物品の識別子は登録日時の秒 `reg`）。
- `notifyExtensionRequest(email, results)`: 申請された物品をメールアドレス＋登録日時で特定し、延長希望日を検証したうえで、許可/却下ボタン付きの LINE を管理者へ送る。
- `findItemRow(data, email, reg)`: メールアドレス＋登録日時で対象行を探す。行番号は識別子に使わない。
- `approveRequest(email, reg, newDate)`: 押した時点で対象行を探し直し、handover_on を更新して利用者へ許可メールを送る。
- `rejectRequest(email, reg)`: 押した時点で対象行を探し直し、利用者へ却下メールを送る。
- `requestGmailPermission()`: Gmail 権限の初回承認用（手動実行）。

### dashboard

- `doGet(e)`: 管理画面を表示する。
- `completeRows` / `discardRows` / `restoreRows` / `deleteRows` / `deleteArchiveRows` / `updateAdminNote` / `updateArchiveAdminNote`: 管理画面の各操作（`docs/SPECIFICATIONS.md` §3(4)）。

---

## 3. スクリプトプロパティ

| プロジェクト | キー | 必須 | 内容 |
| --- | --- | :---: | --- |
| stuffForm | `SPREADSHEET_ID` | ○ | スプレッドシート ID |
| stuffForm | `driveFolder_ID` | ○ | 写真を保存する Drive フォルダ ID |
| stuffForm | `LINE_BOT_NOTIFY_URL` | ○ | line_bot Web アプリの URL（未設定だと登録通知が送られない） |
| stuffForm | `EXTEND_FORM_URL` | 推奨 | 延長申請フォーム（GitHub Pages の `extend_form/`）の URL。確認メールに記載する |
| line_bot | `ACCESS_TOKEN` | ○ | LINE チャネルアクセストークン |
| line_bot | `USER_ID` | ○ | 通知先（管理者）の LINE ユーザー ID |
| line_bot | `EXTEND_FORM_URL` | ○ | 延長申請フォーム（GitHub Pages の `extend_form/`）の URL。リマインドメールに記載する |
| line_bot | `SPREAD_SHEET_ID` | ○ | スプレッドシート ID |
| line_bot | `SHEET_NAME_MANAGE` | ○ | `items` |
| extend_form | `ACCESS_TOKEN` | ○ | LINE チャネルアクセストークン |
| extend_form | `USER_ID` | ○ | 管理者の LINE ユーザー ID（Webhook はこのユーザーのイベントのみ処理） |
| extend_form | `SPREAD_SHEET_ID` | ○ | スプレッドシート ID |
| extend_form | `SHEET_NAME_MANAGE` | ○ | `items` |
| dashboard | `SPREADSHEET_ID` | ○ | スプレッドシート ID |

`line_bot` と `extend_form` は必須プロパティが無いと起動時に例外で停止する（`getRequiredProperty`）。
GitHub Actions の Secrets には `STUFF_GAS_URL` / `EXTEND_GAS_URL`（各 Web アプリの URL）を設定する。

---

## 4. トリガー設定

- 物品登録・延長申請・登録通知は Web アプリの `doPost` で受け付けるため、インストール型トリガーは不要。
- LINE チャネルの Webhook URL には `extend_form` の Web アプリ URL を設定する。
- 時間主導トリガー: `line_bot` で毎日 1 回（9 時台）`handoverDayRemind` を実行する。
  - トリガーは line_bot の Apps Script エディタで `setupReminderTrigger` を実行して作成する（実行者が持つ既存の同名トリガーは作り直される）。
  - トリガーは作成したアカウントに紐づく。リマインドメールの送信元もそのアカウントになるため、運用担当（管理者）のアカウントで作成する。担当者の交代・卒業時は新担当者のアカウントで作り直す。
  - 他のアカウントが作成したトリガーは、トリガー画面や `listReminderTriggers` に表示されない。トリガーを二重に作るとリマインドが二重に送られるため注意する。
  - 実行状況は Apps Script の「実行数」で確認できる。`handoverDayRemind` は終了時に `summary=` をログに出力する。
- Web アプリとして公開しているプロジェクトは、コード変更後に新しいバージョンでデプロイし直さないと反映されない。時間主導トリガーは保存済みの最新コードで実行される。

---

## 5. 外部 API / スコープ

- Google スプレッドシート（読み書き）
- Google Drive（写真の保存: stuffForm）
- Gmail（メール送信: stuffForm / line_bot / extend_form）
- 外部リクエスト（LINE Messaging API、stuffForm → line_bot の通知）
- スクリプトトリガーの管理（line_bot の `setupReminderTrigger`）

---

## 6. エラーハンドリングとロギング

- 送信処理（メール・LINE）は try/catch で `{ success, message }` を返し、失敗理由を `Logger.log()` に残す。
- LINE Push は最大 3 回まで再試行する（4xx は再試行しない）。
- エラー記録用のシートは設けていない。障害調査は Apps Script の「実行数」とログで行う。

---

## 7. デプロイ手順

**[clasp ガイド](CLASP_GUIDE.md)** を参照。静的 HTML は main への push で GitHub Pages に公開される（`.github/workflows/deploy.yml`）。
