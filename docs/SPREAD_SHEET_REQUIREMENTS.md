
## スプレッドシート構造

`items` シート
| 列 | カラム名 | 型 | 説明 |
| ---: | --- | --- | --- |
| A | registered_at | DateTime | フォーム送信時刻（自動記録） |
| B | email | Text | 登録者メール |
| C | name | Text | 登録者氏名 |
| D | organization | Text | 団体名 |
| E | photo_file_id | Text | Drive ファイル ID  |
| F | handover_on | Date | 明け渡し日（YYYY-MM-DD） |
| G | days_until_handover | Number | 明け渡し日までの日数（計算列） |
| H | status | Text | active / archived / pending |
| I | admin_note | Text | 管理者備考 |

