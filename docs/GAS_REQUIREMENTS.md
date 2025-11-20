# TODO

このドキュメントは、以下の3つの独立したGAS仕様書に分割されます。

Spreadsheet GAS

Form GAS

View GAS

分割が完了するまで、このドキュメントを各仕様書のテンプレートとして参照してください。
# GAS 要件・実装仕様書

このドキュメントは本プロジェクトで使用する Google Apps Script (GAS) の実装仕様をまとめたものです。実装者・運用者が参照することを想定しています。

---

## 1. 目的

GAS 側は主に次を担います。

- Forms / Google Spread Sheets との連携（申請データの受信・記録）
- 画像ファイルの Drive への保存・リンク管理
- 明け渡し日（撤去）のリマインダー送信（メール / LINE 連携）

---

## 2. 主要モジュールと関数一覧（推奨）

以下は実装例の関数一覧です。ファイル分割や命名はプロジェクト規約に合わせてください。

- Code.gs (エントリポイント)
	- onFormSubmit(e): フォーム送信イベントハンドラ。受信データを検証→Drive保存→スプレッドシート追記→確認メール送信。
	- dailyReminderTrigger(): 毎日実行。明け渡し日までの残日数を評価し、リマインド/管理者通知を行う。

- drive-utils.gs
	- saveFileToDrive(fileBlob, folderId): Drive にファイルを保存し、fileId を返す。

- sheet-utils.gs
	- appendFormData(rowObject): スプレッドシートに行を追加する。返り値: 行番号。内部で日付フォーマットやID付与を行う。
	- calcDaysUntil(dateString): 明け渡し日までの日数を計算して返す（GAS 内での利用向け）。

- notify-utils.gs
	- sendConfirmationEmail(email, params): 申請者への確認メール送信。
	- sendReminderEmail(email, params): 申請者へのリマインド送信。
	- sendAdminNotification(adminIds, params): 管理者向けの通知（LINE / メール）を送る。

- admin-actions.gs
	- markAsArchived(rowId, user): 撤去完了処理。アーカイブ対象としてフラグを立てる／別シートへ移動する。
	- approveExtension(rowId, newDate, adminUser): 延長申請を承認する処理。

---

## 3. データスキーマ（スプレッドシート）

スプレッドシートの列定義は `docs/SPREAD_SHEET_REQUIREMENTS.md` を唯一の正規仕様として参照してください（Timestamp, email, name, organization, photo_file_id, handover_date, days_until_handover など）。

補足: 監査・運用のために `status`（active/archived）、`admin_note`、`last_updated_by` カラムを追加することを推奨します。

---

## 4. トリガー設定

- onFormSubmit: フォームの送信イベントに紐づける（プロジェクトのトリガーまたはスクリプト内で `ScriptApp.newTrigger('onFormSubmit')...` を設定）。
- time-driven: 毎日 1 回の時間主導トリガーで `dailyReminderTrigger` を実行。

---

## 5. 外部 API / スコープ

GAS が必要とする OAuth スコープの例（実際のコードで使用するサービスに応じて調整してください）:

- https://www.googleapis.com/auth/spreadsheets (スプレッドシートの読み書き)
- https://www.googleapis.com/auth/drive.file (Drive へのファイル保存)
- https://www.googleapis.com/auth/script.external_request (外部 API 呼び出し、LINE など)
- https://www.googleapis.com/auth/gmail.send (Gmail でのメール送信を使う場合)

注意: Apps Script プロジェクトのマニフェストで必要な OAuth スコープを明示し、GCP コンソールで Apps Script API を有効化してください。

---

## 6. エラーハンドリングと監査

- 各外部操作（Drive 保存、スプレッドシート書込、外部 API 呼び出し）で try/catch を行い、失敗時は管理者へ通知し、エラー情報を `errors` シートやログに保存する。
- 再試行戦略: Drive 保存失敗など一時的エラーは最大 3 回程度のバックオフ付き再試行を行う。

---

## 7. ロギング

- `Logger.log()` を適切に使う。重要イベント（送信成功、メール送信失敗、外部 API レスポンス）をログに残す。
- 運用上、Stackdriver（Cloud Logging）等に連携する場合は別途設定を検討する。

---

## 8. デプロイ手順（簡易）

**[clasp ガイド](CLASP_GUIDE.md)**
---

## 9. 監視と運用

- 定期的に `errors` シートを確認し、メール通知が失敗していないかを確認する。
- 重要な変更（スコープの追加、外部 API キーの更新など）はドキュメント化して運用手順に追加する。

---

作成者: STEAM_tracker チーム
更新日: 2025-11-10

