# GitHubGuide
## コーディングの始め方

1. リポジトリをローカルに **Clone** します
	SSHでCloneしてほしいので以下のものをそのまま貼り付けてください。
```
git clone git@github.com:RyukokuDX/STEAM_tracker.git
```
    
2. プロジェクトのディレクトリに移動し、依存関係をインストールします:
```
cd YOUR_REPOSITORY
npm install
```
    
3. 変更内容に応じたブランチを作成します。ブランチ名は自分の名前を入れて分かりやすいものにしてください。
		必ずブランチ名は**苗字**を使ってください。また苗字の頭は**小文字**でお願いします。
```
# 例: ログイン機能を作成するとき
git checkout -b mitani/feature/login
```
4. 作業を開始してください
5. 切りが良いタイミングや一日の作業の終わりのタイミングで**Commit**してください
    そのときコミットメッセージを書いてもらうのですがそれは以下のフォーマットでお願いします。

    [コミットメッセージの仕様](/docs/COMMIT_MESSAGE_SPECIFICATION.md)
```
git commit -m "コミットメッセージ"
```
その後
```
git push
```
これで基本の作業は終了です。


## プルリクエストの作成

ブランチでの作業が完了し、developブランチにマージしてほしい場合は、プルリクエストを作成してください。
プルリクエストを作成するときは以下を参考にしてください

[プルリクエストの手順書](/docs/PULLREQUESTS_COMMENT_SPECIFICATION.md)


