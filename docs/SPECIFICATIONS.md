# 要件仕様書

---

## 1. システム概要

本システムは、スチームコモンズにおける物品の登録・延長申請を自動で管理する。
Google Apps Script（GAS）とHTMLによるWebアプリを中心に、スプレッドシート、Gmail、LINEを連携させて運用する。
本仕様書では、要件定義書で定められた要件を基に、各機能の動作仕様を定義する。

実装は以下のモジュールに分割されている。

| モジュール | パス | 役割 |
| :-- | :-- | :-- |
| 物品登録フォーム | `stuffForm/` | 利用者による物品登録の Web フォーム |
| 延長申請フォーム | `extend_form/` | 利用者による延長申請の Web フォーム + LINE Webhook 受信 |
| LINE Bot | `line_bot/` | 登録通知 / 明け渡しリマインドの LINE 送信 |
| ダッシュボード | `dashboard/` | 管理者向けの登録物品一覧・操作画面 |

個別機能の詳細仕様は以下に分離されている。

- [`docs/FORM_REQUIREMENTS.md`](./FORM_REQUIREMENTS.md)
- [`docs/EXTEND_FORM_SPECIFICATION.md`](./EXTEND_FORM_SPECIFICATION.md)
- [`docs/LINE_BOT_SPECIFICATION.md`](./LINE_BOT_SPECIFICATION.md)

---

## 2. システム構成

| 区分       | 使用ツール              | 実装モジュール | 機能概要                                                   |
| :------- | :----------------- | :-- | :----------------------------------------------------- |
| 登録処理     | GAS + HTML（Webアプリ） | `stuffForm/` | フォーム画面で入力された内容をスプレッドシートの管理シートへ記録する。日付入力には上限日・下限日を設定する。 |
| データ管理    | Googleスプレッドシート     | -    | 登録データを一元管理し、残り日数や状態を自動更新する。                            |
| 日次処理     | GAS（時間主導トリガー）      | `line_bot/` (`handoverDayRemind`) | 撤去予定日が近い登録に対してリマインダーを送信する。 |
| リマインダー通知 | Gmail + LINE       | `line_bot/` | 撤去予定日が近づいた利用者にメール、管理者にLINEで通知する。                    |
| 延長申請     | GAS + HTML（Webアプリ）         | `extend_form/` | 利用者が撤去日の延長を申請するためのフォーム。日付入力には上限日・下限日を設定する。                                |
| 管理者通知    | LINE               | `line_bot/`, `extend_form/` | 物品の登録・リマインダー・延長申請を管理者へ通知する。 |
| 延長申請承認処理 | LINE postback + GAS | `extend_form/` | 管理者が LINE のボタン（postback）で申請を許可/却下する。 |
| アーカイブ処理  | GAS                | 未実装 | 撤去完了済みのデータをアーカイブ用シートに自動で移動する（計画中）。 |

---

## 3. 処理仕様

### （1）登録処理（`stuffForm/`）

- GASとHTMLで構築したWebアプリ上の登録フォームを使用する。
- 入力項目は「メールアドレス、氏名、団体名、写真（Driveリンク）、撤去予定日」とする。
- 撤去予定日には、フォーム上で **過去の日付を入力不可** とし、さらに **年度末まで** を上限日として設定する。
- フォーム送信時、GASが入力内容を取得しスプレッドシートの管理シートに記録する。
- 記録完了後、LINE Bot の `doPost`（`action=notifyRegistration`）を呼び出し、管理者に LINE で登録通知を送信する（`line_bot/` の `registerNotify`）。
- 利用者には登録完了確認メールを自動送信する。
- スプレッドシートの列構成は §4 を参照。
- 初期状態はすべて「未完了」として登録される。

### （2）日次自動処理（`line_bot/handoverDayRemind`）

- 時間主導トリガーにより、毎日指定時刻に実行される。
- 管理シートを走査し、`DAYS_UNTIL_HANDOVER` 列の値が **3** または **0** の行について：
  - 登録者へ Gmail でリマインドメールを送信する（延長申請フォームへのリンクを含む）。
  - 管理者へ LINE でリマインド通知を送信する。メール送信失敗時は LINE メッセージにその旨を付記する。
- `DAYS_UNTIL_HANDOVER` 列は別処理（スプレッドシート側の計算式）で自動更新される前提。

### （3）延長申請処理（`extend_form/`）

詳細は [`docs/EXTEND_FORM_SPECIFICATION.md`](./EXTEND_FORM_SPECIFICATION.md) を参照。主要フロー：

1. 利用者が `extend_form/index.html` で学籍番号とメールアドレスを入力し、自身の物品一覧を取得（`getItemsByEmail`）。
2. 延長希望日を入力し、申請を送信（`notifyExtensionRequest`）。
3. 管理者の LINE に「許可 / 却下」ボタン付きメッセージが送信される。
4. 管理者がボタンを押下 → LINE Webhook 経由で `approveRequest` / `rejectRequest` が実行される。
5. 許可時はスプレッドシートの `HANDOVER_ON` 列を更新し、利用者にメールで承認通知。
6. 却下時は利用者にメールで却下通知。

### （4）撤去完了・アーカイブ処理（未実装）

以下は仕様として定義されているが、現時点では実装されていない。

- **撤去完了処理**: 管理者がスプレッドシートの「状態」列を「完了」に変更する運用想定。
- **アーカイブ処理 `archiveCompletedItems`**: 「状態」が「完了」の行をアーカイブ用シートに移動し、元シートから削除する処理。

---

## 4. スプレッドシート構成

### ● 管理シート（登録データ管理）

実装上の列インデックスは以下（`line_bot/GAS/code.js`、`extend_form/GAS/code.js` 参照）。

| index | 列名 | 備考 |
| :-- | :-- | :-- |
| 0 | REGISTERED_AT | フォーム送信時刻（自動記録） |
| 1 | EMAIL | 登録者メールアドレス |
| 2 | NAME | 氏名 |
| 3 | ORGANIZATION | 団体名 |
| 4 | PHOTO_FILE_ID | Drive ファイル ID |
| 5 | HANDOVER_ON | 明け渡し日（YYYY-MM-DD） |
| 6 | DAYS_UNTIL_HANDOVER | 明け渡し日までの日数（計算列） |
| 7 | STATUS | active / archived / pending |
| 8 | ADMIN_NOTE | 管理者備考 |

### ● アーカイブ用シート（撤去完了データの保存、未実装）

計画中。仕様策定時点では以下の列構成を想定している。

| メールアドレス | 氏名 | 団体名 | 写真 | 撤去予定日 | 確認日 |
| :-- | :-- | :-- | :-- | :-- | :-- |

---

## 5. トリガー仕様

| トリガー種別 | 対象モジュール | 実行内容 | 実行タイミング |
| :-- | :-- | :-- | :-- |
| Webアプリ (doPost) | `stuffForm/` | 回答内容をスプレッドシートに記録、確認メール送信、LINE 登録通知 | 各登録時 |
| Webアプリ (doPost) | `extend_form/` | 静的HTMLからの fetch、または LINE Webhook を受信 | 延長申請送信時 / LINEボタン押下時 |
| 時間主導型 | `line_bot/handoverDayRemind` | 撤去予定日が 3 日後・当日の登録に対しリマインドを送信 | 日次 |

未実装のトリガー：

- 年度末一斉通知（`docs/LINE_BOT_SPECIFICATION.md` §4 参照）
- アーカイブ処理（§3-(4)）

---

## 6. エラー処理

- **日付形式エラー**：延長申請時、`YYYY-MM-DD` にマッチしない `newDate` は `notifyExtensionRequest` / `approveRequest` で弾き、ログに記録する。
- **ID範囲エラー**：`approveRequest` / `rejectRequest` / `notifyExtensionRequest` で `id` の整数性・範囲を検証し、不正ならログ記録後スキップする。
- **script property未設定エラー**: `getRequiredProperty` で起動時に明示的に throw する（`ACCESS_TOKEN` / `USER_ID` / `SPREAD_SHEET_ID` / `SHEET_NAME_MANAGE` 等）。
- **LINE送信失敗**：`sendLinePushObject` は HTTPステータスを検査し、最大3回の指数バックオフ（1秒→2秒→4秒）でリトライする。4xx は即時失敗、5xx・ネットワーク例外は再試行。戻り値は `{success, message}`。
- **メール送信失敗**：`sendEmail` は try/catch し失敗時に `{success:false, message}` を返す。`handoverDayRemind` ではメール失敗を LINE メッセージに付記する形で管理者へ通知する。
- **Webアプリ送信エラー**：入力値が不正または必須項目が未入力の場合、エラーメッセージをフォーム上に表示する。

未実装のエラー処理：

- **送信失敗の永続化**：スプレッドシートの「送信失敗」列に記録する機構は未実装（現状は Logger.log のみ）。
- **アーカイブ失敗通知**：アーカイブ処理自体が未実装のため該当なし。
- **再試行失敗時の管理者エスカレーション**：`sendLinePushObject` が最終的に失敗した場合、別チャネル（メール等）で管理者に通知する上位ハンドラは未実装。

---

## 7. 今後の拡張予定

- 年度末一斉通知の実装（`docs/LINE_BOT_SPECIFICATION.md` §4 記載の仕様）。
- アーカイブ処理 `archiveCompletedItems` の実装。
- 通知失敗時の管理者エスカレーションルート整備（別チャネル通知）。
- `line_bot/` と `extend_form/` で重複している `sendEmail` / `sendLineMessage` / `sendLinePushObject` / `getRequiredProperty` を clasp の library 参照機能で共通化する。
- 管理者向けのダッシュボード画面（`dashboard/` 配下で進行中）。
- LINE Messaging APIのメッセージ内容を動的に変更できるようにする。

---

## 補足

- 本仕様書は要件定義書に記載された業務要件を基に、具体的な動作仕様を定義したものである。
- 実装時の関数名は本仕様書記載のものを参照しているが、細部（引数名等）は実装コードを正とする。
