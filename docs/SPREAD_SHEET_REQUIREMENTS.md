# スプレッドシート要件（現行実装準拠）

## 1. シート構成

現行実装では以下の2シートを使用する。

- items
- archives

両シートの列構成は同一で、アーカイブ時は行をそのまま移動する。

## 2. カラム定義（両シート共通）

| 列 | カラム名 | 型 | 説明 |
| ---: | --- | --- | --- |
| A | registered_at | DateTime | フォーム送信時刻（自動記録） |
| B | email | Text | 登録者メール |
| C | name | Text | 登録者氏名 |
| D | organization | Text | 団体名 |
| E | photo_file_id | Text | Drive ファイル ID |
| F | handover_on | Date | 明け渡し日（登録時は yyyy/MM/dd、延長許可時は YYYY-MM-DD で書き込まれる） |
| G | days_until_handover | Number | 旧仕様の残り日数列。現行実装では値を書き込まない（下記参照） |
| H | status | Text | 状態値（下記参照） |
| I | admin_note | Text | 管理者備考 |

## 3. status 値

- active: items 上の有効データ
- archived: 撤去済みとしてアーカイブしたデータ
- discarded: 破棄済みとしてアーカイブしたデータ

## 4. 運用ルール

- 新規登録時は status=active で保存する。
- 撤去済み/破棄済み処理では status を更新後、行を archives へ移動し、items から削除する。
- 復元処理では status を active に戻して items へ移動する。
- リマインド通知および延長申請対象抽出は status=active のみを対象とする。
- 延長申請の許可時は handover_on を希望延長日に更新する。
- 延長申請では registered_at（A 列）と email（B 列）の組み合わせで物品を特定する。申請中の物品の A 列・B 列を編集すると、許可/却下できなくなる（管理者に LINE で通知される）。

## 5. days_until_handover（G 列）について

- 残り日数は、リマインド処理（`line_bot` の `handoverDayRemind`）が実行時に handover_on（F 列）から算出する。G 列の数式や日次更新処理は不要。
- 登録フォームは G 列を空欄で書き込む。列は既存データとの互換のために残している。
- F 列から日付を読み取れない行に限り、G 列の数値をリマインド判定に使う。G 列が空欄の行を 0 日（当日）とは扱わない。
- ダッシュボードには G 列を表示しない。
