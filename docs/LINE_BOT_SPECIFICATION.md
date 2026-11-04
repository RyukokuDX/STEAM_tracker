# LINE Bot仕様書

## 1. 目的
本Botは、スチームコモンズ物品管理システムの運用補助を目的とし、管理者のみが利用する通知・申請管理Botです。

## 2. 主な機能

1. handoverDayRemind（スプレッドシート上の日付を確認し、リマインドする日付であれば9~10時の間にメッセージを送信）
2. registerNotify（物品登録の通知）
3. extendRequestNotify （延長申請の通知、申請受信時に該当フォームへ誘導する）
4. sendLineMessage（LINE Messaging APIでメッセージを送信）

## 3. 利用者と権限

| 役割       | 主な操作・権限                       |
|:-----------|:-------------------------------------|
| 管理者     | 申請承認/否認、通知送信、履歴確認     |

## 4. メッセージ仕様

- 物品登録時：管理者に「新規物品登録通知」（写真・氏名・団体名・明け渡し日を表示）
- 明け渡し日3日前・当日：管理者に「リマインダー通知」
- 延長申請時：管理者に「延長申請通知」
	- メッセージ内に延長申請フォーム（Apps Scriptで作成した独自フォーム）へのリンク（またはボタン）を含め、管理者が該当フォームへアクセスできるようにする
- 年度末：管理者に「一斉通知」

## 5. 技術構成

- LINE Messaging API
- Google Apps Script（GAS）連携
- Apps Script（GAS）で作成した独自フォーム / スプレッドシート連携

## 6. エラー・例外処理

- 通知失敗時は自動で再試行を行い、再試行失敗時は管理者に通知（エラーの種類や原因など）を送信する。
- 不正な申請・データがあった場合は、管理者に通知（申請ミス・例外など）を送信する。

## 7. リマインド通知の判定と運用

- 実行関数：`handoverDayRemind`（日次の時間主導トリガー、9時台）。トリガーは `setupReminderTrigger` を手動実行して作成する。
- 対象：items シートで status が active の行。
- 残り日数は F列（handover_on）と実行日から算出する。F列から算出できない場合のみ G列（days_until_handover）の数値を使う。G列の空欄は 0 日として扱わない。
- 残り日数が 3 日・0 日の行について、登録者へ Gmail、管理者へ LINE を送信する（メール失敗時は LINE 本文に失敗理由を付記）。
- 終了時に `summary=` ログ（rows / sent / skippedStatus / skippedDays / invalidDate / mailFailed / lineFailed）を出力する。
- status が空欄の既存行（status 管理導入以前の登録分）は `backfillActiveStatus` を一度実行して active に補完する。

## 8. 延長申請フォームへの導線

- 登録完了の確認メール（stuffForm）に延長申請フォームの URL を記載する（stuffForm のスクリプトプロパティ `EXTEND_FORM_URL`）。
- 明け渡し 3 日前・当日のリマインドメールにも同フォームの URL を記載する（line_bot のスクリプトプロパティ `FORM_URL`）。
- 両プロパティには GitHub Pages で公開している `extend_form/` の URL を設定する。
