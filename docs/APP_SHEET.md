# AppSheet 仕様書

> スキーマバージョン: v1.0 （2025-11-01）
>
> `items` シートの列配置は次の通り（必ず `docs/FORM_REQUIREMENTS.md` と一致させてください）。
>
> A: registered_at | B: email | C: name | D: organization | E: photo_file_id | F: handover_on | G: days_until_handover | H: status | I: admin_note

このドキュメントは AppSheet を用いた管理者向けダッシュボード（管理画面）の仕様書です。対象は管理者が物品の一覧確認、検索、アーカイブ、延長承認などの操作を行うための AppSheet アプリとなります。

---

## 1. データソース（前提）

- Google スプレッドシート（`STEAM_tracker` プロジェクト内のシート）を AppSheet のデータソースとして使用。
- 参照するシート:
  - `items`（登録済み物品）
  - `archives`（アーカイブ済み物品）
  - `users`（管理者・利用者情報、必要に応じて）

各シートのカラム（想定）

`items` シート
| 列 | カラム名 | 型 | 説明 |
| ---: | --- | --- | --- |
| A | registered_at | DateTime | フォーム送信時刻（自動記録） |
| B | email | Text | 登録者メール |
| C | name | Text | 登録者氏名 |
| D | organization | Text | 団体名 |
| E | photo_file_id | Text | Drive ファイル ID / 共有リンク |
| F | handover_on | DATE | 明け渡し日（YYYY-MM-DD） |
| G | days_until_handover | NUMBER | 明け渡し日までの日数（計算列） |
| H | status | Text | active / archived / pending |
| I | admin_note | Text | 管理者備考 |

`archives` シート
| 列 | カラム名 | 型 | 説明 |
| ---: | --- | --- | --- |
| A | id | Text (キー) | 元 item の id |
| B | archived_at | DATETIME | アーカイブ日時 |
| C | reason | Text | アーカイブ理由 |

`users` シート（任意: 管理者認証や表示名に利用）
| 列 | カラム名 | 型 | 説明 |
| ---: | --- | --- | --- |
| A | id | Text | ユーザーID |
| B | email | Text | メールアドレス |
| C | role | Text | ロール (admin等) |
| D | display_name | Text | 表示名 |

---

## 2. 主要ビュー

1. Items List（一覧）
   - 表示: `items` の active レコードのみ
   - ソート: days_until_handover ASC（期限が近い順）
   - フィルタ: status = "active"
   - アクション: 詳細表示、アーカイブ、延長申請の承認ボタン

2. Item Detail（詳細）
   - フィールド: photo (表示/拡大), name, email, organization, handover_date, days_until_handover, admin_note
   - アクション: 『アーカイブ』, 『延長を許可』, 『管理メモ編集』

3. Archive View
   - 表示: `archives` シートの内容
   - 検索・フィルタ: 日付レンジ、理由で絞り込み

4. Admin Dashboard
   - KPI: 今月のアーカイブ数、期限切れ数、未処理件数

---

## 3. アクション（AppSheet アクション）

- Archive Item
  - タイプ: Data: add a row to another table (archives) + Data: set the values of some columns
  - 動作: items の status を `archived` に更新し、archives シートにアーカイブ情報を追加する。

- Approve Extension
  - タイプ: Data: set the values of some columns
  - 動作: handover_date を指定日時に更新し、status を `active` に保つ。

- Edit Admin Note
  - タイプ: Edit
  - 動作: admin_note に文字列を入力。

---

## 4. ワークフロー / 通知

- AppSheet のワークフロー（Bots）を利用して以下を実装。
  - アーカイブ時に管理者に通知（メール / LINE via webhook）
  - 明け渡し日が近いアイテムに対して、ユーザーに通知を送る（トリガー: 日次 AppSheet Automation）

---

## 5. アクセス制御

- 管理者は AppSheet のユーザーリストに登録し、`role` を `admin` に設定。アプリ内部で role によるビューの表示制御を行う。
- ユーザーの閲覧は禁止

---

## 6. 同期とオフライン動作

- AppSheet はオフライン編集をサポートするが、アップロード（写真等）はオンライン時にのみ成功する点に注意。
- 重要: 複数クライアントが同時に行う編集の競合を避けるため、`status` をロックする簡易的な運用ルール（例: 編集中は admin_note に "LOCKED" を入れる）を検討。

---

## 7. テストケース

- TC-01: 管理者でログイン → 一覧で期限近い順に表示されることを確認。
- TC-02: 詳細からアーカイブ → items の status が `archived`、archives に行が追加されることを確認。
- TC-03: 延長承認 → handover_date が更新され、days_until_handover が正しく再計算されることを確認。

---

## 8. 導入手順（簡易）

1. Google スプレッドシートのテンプレを用意し、`items` / `archives` / `users` シートを作成。
2. AppSheet で新しいアプリを作成し、上記スプレッドシートをデータソースとして追加。
3. 各テーブルのキー・ラベルを設定し、ビューを作成。
4. アクション・Bot（ワークフロー）・権限を設定。
5. 管理者アカウントを招待して動作確認。

---

作成者: STEAM_tracker チーム
更新日: 2025-11-10
