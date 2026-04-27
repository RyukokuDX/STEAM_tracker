# スプレッドシート要件（現行実装準拠）

## 1. シート構成

現行実装では以下の2シートを使用する。

- 管理シート
- アーカイブ用シート

両シートの列構成は同一で、アーカイブ時は行をそのまま移動する。

## 2. カラム定義（両シート共通）

| 列 | カラム名 | 型 | 説明 |
| ---: | --- | --- | --- |
| A | registered_at | DateTime | フォーム送信時刻（自動記録） |
| B | email | Text | 登録者メール |
| C | name | Text | 登録者氏名 |
| D | organization | Text | 団体名 |
| E | photo_file_id | Text | Drive ファイル ID |
| F | handover_on | Date | 明け渡し日（YYYY-MM-DD） |
| G | days_until_handover | Number | 明け渡し日までの日数（計算列） |
| H | status | Text | 状態値（下記参照） |
| I | admin_note | Text | 管理者備考 |

## 3. status 値

- active: 管理シート上の有効データ
- archived: 撤去済みとしてアーカイブしたデータ
- discarded: 破棄済みとしてアーカイブしたデータ

## 4. 運用ルール

- 新規登録時は status=active で保存する。
- 撤去済み/破棄済み処理では status を更新後、行をアーカイブ用シートへ移動し、管理シートから削除する。
- 復元処理では status を active に戻して管理シートへ移動する。
- リマインド通知および延長申請対象抽出は status=active のみを対象とする。

