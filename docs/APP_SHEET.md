# 管理画面データ仕様書

> スキーマバージョン: v1.1 （2026-04-27）
>
> 本ドキュメントは現行実装（GAS + ダッシュボード）のデータ仕様に準拠する。
> スキーマの正規定義は docs/SPREAD_SHEET_REQUIREMENTS.md と一致させること。

このドキュメントは、管理画面（ダッシュボード）と関連GASが前提とするシート構成・状態遷移・運用手順を定義する。

---

## 1. データソース

- Google スプレッドシートを使用する。
- 使用シート:
  - 管理シート
  - アーカイブ用シート

両シートのカラムは同一とする。

| 列 | カラム名 | 型 | 説明 |
| ---: | --- | --- | --- |
| A | registered_at | DateTime | フォーム送信時刻 |
| B | email | Text | 登録者メール |
| C | name | Text | 登録者氏名 |
| D | organization | Text | 団体名 |
| E | photo_file_id | Text | Drive ファイル ID |
| F | handover_on | Date | 明け渡し日 |
| G | days_until_handover | Number | 明け渡し日までの日数 |
| H | status | Text | active / archived / discarded |
| I | admin_note | Text | 管理者備考 |

---

## 2. 主要ビュー

1. 管理シートビュー
  - 管理対象のデータを表示
  - 操作: 撤去済みにする、破棄済みにする、削除、備考編集

2. アーカイブシートビュー
  - アーカイブ済みデータを表示
  - 操作: 管理シートへ戻す、削除、備考編集

---

## 3. 状態遷移

1. 新規登録
  - status = active で管理シートに追加

2. 撤去済み処理
  - 管理シートの対象行 status を archived に更新
  - 対象行をアーカイブ用シートへコピー
  - 管理シートの元行を削除

3. 破棄済み処理
  - 管理シートの対象行 status を discarded に更新
  - 対象行をアーカイブ用シートへコピー
  - 管理シートの元行を削除

4. 復元処理
  - アーカイブ用シートの対象行 status を active に更新
  - 管理シートへコピー
  - アーカイブ用シートの元行を削除

---

## 4. 通知・延長申請の対象条件

- リマインド通知対象: status=active のみ
- 延長申請対象抽出: status=active のみ
- 非対象: archived / discarded

---

## 5. 導入手順（簡易）

1. スプレッドシートに 管理シート と アーカイブ用シート を作成する。
2. 両シートのヘッダーを同一に設定する。
  - registered_at, email, name, organization, photo_file_id, handover_on, days_until_handover, status, admin_note
3. Script Properties のシート名関連設定（利用するスクリプト側）を環境に合わせて設定する。
4. ダッシュボードで撤去・破棄・復元・削除が期待通り動くことを確認する。
5. active 以外が通知/延長対象に入らないことを確認する。

---

作成者: STEAM_tracker チーム
更新日: 2026-04-27
