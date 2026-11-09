# 要件仕様書

> 本仕様書は現行実装（`stuffForm` / `extend_form` / `line_bot` / `dashboard`）に準拠する。
> 実装を変更した場合は本書も合わせて更新すること。
> 最終更新: 2026-11-05

---

## 1. システム概要

本システムは、スチームコモンズにおける物品の登録・リマインド・延長申請・撤去管理を行う。
利用者向け画面は GitHub Pages で公開する静的 HTML、処理は Google Apps Script（GAS）の Web アプリで行い、Google スプレッドシート・Gmail・LINE を連携させて運用する。
業務要件は `docs/REQUIREMENTS.md` を参照する。

---

## 2. システム構成

| 区分 | モジュール | 実体 | 機能概要 |
| :--- | :--- | :--- | :--- |
| 物品登録 | `stuffForm` | 静的 HTML（GitHub Pages）+ GAS Web アプリ | 利用者が物品を登録する。items へ記録し、確認メールと管理者 LINE 通知を送る。 |
| リマインド・登録通知 | `line_bot` | GAS（時間主導トリガー + Web アプリ） | 明け渡し 3 日前・当日に利用者へメール、管理者へ LINE を送る。登録通知を LINE に中継する。 |
| 延長申請 | `extend_form` | 静的 HTML（GitHub Pages）+ GAS Web アプリ | 利用者が延長を申請し、管理者が LINE のボタンで許可/却下する。 |
| 管理画面 | `dashboard` | GAS Web アプリ | 管理者が物品の一覧確認・撤去済み/破棄済み処理・復元・削除・備考編集を行う。 |
| データ | Google スプレッドシート | items / archives シート | 登録データを保持する（列定義は `docs/SPREAD_SHEET_REQUIREMENTS.md`）。 |

GitHub Pages への公開は `.github/workflows/deploy.yml` で行う（main への push 時）。静的 HTML 内の GAS URL はプレースホルダ（`%%STUFF_GAS_URL%%` / `%%EXTEND_GAS_URL%%`）で、Actions の Secrets から埋め込む。

---

## 3. 処理仕様

### （1）物品登録（`stuffForm`）

* 利用者は館内に掲示された QR コードから登録フォームを開く。
* 利用規約を最後までスクロールし、第 6 条の確認チェックとクイズに正解すると入力画面に進める。
* 入力項目と検証（サーバー側 `submitForm` でも同じ検証を行う）:

| 項目 | 必須 | 検証 |
| :--- | :---: | :--- |
| 氏名 | ○ | 前後空白を除去、50 文字以内 |
| 団体名 | 任意 | なし |
| 写真 | ○ | ブラウザで長辺 1280px・JPEG に圧縮して送信。サーバーは JPEG/PNG/WebP のみ受け付け、Drive（`driveFolder_ID`）に保存してファイル ID を記録 |
| メールアドレス | ○ | 形式チェック、`@mail.ryukoku.ac.jp` のみ（大文字小文字は区別しない） |
| 明け渡し日 | ○ | `YYYY-MM-DD`、今日以降かつ年度末（3 月 31 日）まで |

* 送信時、items シートに 1 行追加する（排他制御: ScriptLock 30 秒）。
  * `registered_at` = 送信時刻、`handover_on` = `yyyy/MM/dd`、`days_until_handover` = 空欄、`status` = `active`、`admin_note` = 空欄。
* 登録者に確認メールを送る。
  * 件名: 「【STEAMコモンズ】物品登録完了のお知らせ」
  * 本文: 氏名・団体名・明け渡し日、撤去のお願い、延長申請フォームの URL（スクリプトプロパティ `EXTEND_FORM_URL` が設定されている場合）、所在地。
  * 送信に失敗した場合、登録自体は完了した旨とエラー理由をフォームに表示する。
* `line_bot` の Web アプリへ登録通知を依頼し、管理者に LINE を送る（写真・氏名・団体名・明け渡し日）。失敗時は完了メッセージにその旨を付記する。

### （2）明け渡しリマインド（`line_bot` / `handoverDayRemind`）

* 時間主導トリガーで毎日 9 時台に実行する。トリガーは `setupReminderTrigger` を手動実行して作成する。
* 対象: items シートで `status` が `active` の行。
* 残り日数は `handover_on`（F 列）と実行日の日付差で算出する（日本時間基準。スプレッドシート等のタイムゾーン設定には依存しない）。
  * F 列から算出できない場合のみ G 列の数値を使う。G 列の空欄は 0 日として扱わない。
* 残り日数が **3 日** または **0 日** の行について送信する。

| タイミング | 利用者（`email`）へ Gmail | 管理者へ LINE |
| :--- | :--- | :--- |
| 3 日前 | 件名「STEAMコモンズ 明け渡し3日前リマインド通知」、本文に延長申請フォームの URL（`FORM_URL`） | 「[リマインド]{団体名}の{氏名}さんの明け渡し日まであと3日です。」 |
| 当日 | 件名「STEAMコモンズ 明け渡し当日リマインド通知」、本文に同 URL | 「[リマインド]{団体名}の{氏名}さんの明け渡し当日です。」 |

* メールはトリガーを作成したアカウントの Gmail から送信される。
* メール送信に失敗しても LINE は送り、本文に失敗理由を付記する。
* 期限を過ぎた行（残り日数がマイナス）には通知しない。
* 実行終了時に `summary=` ログ（対象行数・送信数・スキップ理由別件数）を出力する。

### （3）延長申請（`extend_form`）

* 利用者が延長申請フォームにアクセスする導線は、登録完了の確認メールとリマインドメールに記載した URL。
* 学籍番号を入力すると `{学籍番号}@mail.ryukoku.ac.jp` で items を検索し、`status` が `active` の物品を一覧表示する。
* 物品ごとに延長希望日を選ぶ（明日以降、現在の明け渡し日が属する年度の 3 月 31 日まで。初期値は現在の明け渡し日）。
* 送信すると、表示された全物品について管理者へ LINE（延長申請 No.{行番号}、団体名・氏名、希望延長日、「許可」「却下」ボタン）を送る。
* 管理者のボタン操作は LINE Webhook（`extend_form` の `doPost`）で受け取る。`USER_ID` 以外からのイベントは無視する。
  * 許可: `handover_on` を希望延長日に更新し、利用者へ「STEAMコモンズ 延長申請許可通知」メール、管理者へ LINE で処理結果を送る。
  * 却下: 利用者へ「STEAMコモンズ 延長申請却下通知」メール、管理者へ LINE で処理結果を送る。
* 申請受付時点では利用者へのメールは送らない（画面に「確認後メールで通知する」旨を表示する）。

### （4）撤去・アーカイブ（`dashboard`）

* 利用者は物品を撤去したら管理者に口頭で報告する。
* 管理者はダッシュボードで対象行を選び、次の操作を行う（いずれも手動。自動アーカイブは行わない）。

| 操作 | 関数 | 内容 |
| :--- | :--- | :--- |
| 撤去済みにする | `completeRows` | status を `archived` にして archives へ移動し、items から削除 |
| 破棄済みにする | `discardRows` | status を `discarded` にして archives へ移動し、items から削除 |
| items へ戻す | `restoreRows` | status を `active` にして items へ移動し、archives から削除 |
| 削除 | `deleteRows` / `deleteArchiveRows` | 行を削除 |
| 備考編集 | `updateAdminNote` / `updateArchiveAdminNote` | `admin_note` を更新 |

* ダッシュボードには `registered_at`・`email`・`days_until_handover` 列は表示しない。

---

## 4. スプレッドシート構成

列定義・status 値・運用ルールは `docs/SPREAD_SHEET_REQUIREMENTS.md` を正とする。

### ● items（登録データ管理）

| registered_at | email | name | organization | photo_file_id | handover_on | days_until_handover | status | admin_note |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-04-20 10:00:00 | example1@mail.ryukoku.ac.jp | 山田太郎 | ○○サークル | 1AbCdEf... | 2026/04/30 |  | active |  |
| 2026-04-18 16:10:00 | example2@mail.ryukoku.ac.jp | 佐藤花子 | △△研究会 | 9XyZ... | 2026/04/27 |  | active | 連絡済 |

### ● archives（撤去/破棄済みデータの保存）

| registered_at | email | name | organization | photo_file_id | handover_on | days_until_handover | status | admin_note |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-04-10 09:30:00 | example3@mail.ryukoku.ac.jp | 野口太郎 | □□研究会 | 7GhIj... | 2026/04/25 |  | archived | 4/25撤去確認 |
| 2026-04-08 14:00:00 | example4@mail.ryukoku.ac.jp | 鈴木次郎 | △△研究会 | 2KlMn... | 2026/04/22 |  | discarded | 期限超過で処分 |

---

## 5. トリガー・エントリポイント

| モジュール | 種別 | 関数 | 内容 |
| :--- | :--- | :--- | :--- |
| `stuffForm` | Web アプリ（POST） | `doPost` | `uploadPhoto`（写真保存）/ `submitForm`（登録） |
| `line_bot` | Web アプリ（POST） | `doPost` | `notifyRegistration`（登録通知を LINE 送信） |
| `line_bot` | 時間主導（毎日 9 時台） | `handoverDayRemind` | 3 日前・当日のリマインド |
| `extend_form` | Web アプリ（POST） | `doPost` | 静的 HTML からの `getItemsByEmail` / `notifyExtensionRequest`、および LINE Webhook（許可/却下） |
| `dashboard` | Web アプリ（GET） | `doGet` | 管理画面の表示 |

日次で残り日数を更新する処理や、自動アーカイブ処理は存在しない。

---

## 6. エラー処理

* **入力エラー**：登録・延長申請フォームでは、不正な入力にエラーメッセージを表示する。
* **設定エラー**：`line_bot` / `extend_form` は必須スクリプトプロパティやシートが無い場合、起動時に例外を出して停止する（Apps Script の「実行数」に記録される）。
* **メール送信失敗**：
  * 登録時：フォームに失敗理由を表示する。
  * リマインド時：管理者への LINE 本文に失敗理由を付記する。
* **LINE 送信失敗**：最大 3 回まで再試行する（4xx は再試行しない）。失敗はログに記録する。
* **リマインド対象外**：status が active でない行・明け渡し日を判定できない行はスキップし、ログに記録する。

---

## 7. 未実装・今後の拡張候補

* 明け渡し日を過ぎた物品の管理者向け通知
* 年度末の一斉通知（`docs/LINE_BOT_SPECIFICATION.md`）
* LINE 再試行失敗時の管理者へのエスカレーション
* 延長申請受付時の利用者向け確認メール
* 延長申請で日付を変更していない物品を通知対象から除外する
