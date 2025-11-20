# スチームコモンズ 物品管理システム

## 概要

本プロジェクトは、ものづくり環境「スチームコモンズ」内の放置物品問題を解決するための管理システムです。

利用者がQRコードから簡単に物品を登録し、設定した撤去予定日（明け渡し日）に基づき自動でリマインダーを送信します。これにより、所有者を明確化し、スペースの公平かつ効率的な利用を促進することを目的とします。

## ドキュメント
このプロジェクトに関する詳細なドキュメントは、すべてdocsフォルダに格納されています。

-   **[GitHub利用ガイド](./docs/GITHUB_GUIDE.md)**

    -   本プロジェクトにおけるGitおよびGitHubの運用ルールについて説明しています。

-   **[プロジェクト要件定義書](./docs/REQUIREMENTS.md)**

    -   プロジェクトの目的、要件、仕様などを定義したドキュメントです。

-   **[clasp ガイド](./docs/CLASP_GUIDE.md)**

    -   clasp を使った Google Apps Script のローカル開発・ビルド・デプロイ手順をまとめたドキュメントです。

## 主な機能

-   **利用者向け機能**
    -   QRコード経由での物品登録（所有者情報、物品情報、写真、明け渡し日）
    -   明け渡し日前のリマインダーメール受信
-   **管理者向け機能**
    -   LINE Botによる期限切れ物品の自動通知
    -   LINE Botのボタン操作による撤去完了（アーカイブ）処理
    -   （AppSheet）管理ダッシュボードによる登録物品の一覧・検索

## アーキテクチャ（使用技術）

-   **Backend / Automation**: Google Apps Script (GAS)
-   **Database**: Google Sheets
-   **User Registration UI**: Google Forms
-   **Admin Interface**: LINE Messaging API, AppSheet
-   **Development Tool**: clasp, Git, GitHub

## プロジェクト構造

```
STEAM_tracker/
├── docs/                                     # プロジェクトドキュメント
|   ├── CLASP_GUIDE.md                        # claspガイド
│   ├── GITHUB_GUIDE.md                       # Git/GitHub運用ガイド
│   ├── COMMIT_MESSAGE_SPECIFICATION.md       # コミットメッセージの仕様
│   ├── FORM_REQUIREMENTS.md                  # フォーム仕様書
│   ├── GAS_REQUIREMENTS.md                   # GAS仕様書（あとで消す）
│   ├── COMMIT_MESSAGE_AS_CODE_GUIDE.md       # コミットメッセージ駆動開発のガイド
│   ├── PULL_REQUESTS_COMMENT_SPECIFICATION.md # プルリクエストの仕様
│   |── REQUIREMENTS.md                       # 要件定義書
|   |── APP_SHEET.md                          # フロントシート仕様書
|   |── SPECIFICATIONS.md                     # 要件仕様書
|   └── SPREAD_SHEET_REQUIREMENTS.md          # スプレッドシート仕様書
│ 
├── GAS/
|   ├── code.gs
|   └── .claspignore                          # GASにアップしたくないファイル/フォルダを指定
├── .gitignore                                # Gitの管理から除外するファイル/フォルダを指定
├── LICENSE                                   # ライセンス
└── README.md                                 # 本ファイル
```

## 環境構築

### 1. リポジトリのクローン

```bash
git clone git@github.com:RyukokuDX/STEAM_tracker.git
cd STEAM_tracker
```

### 2. 設定ファイルの作成（必要に応じて）
必須環境変数（例: .env）

-   `.env.sample` ファイルをコピーして `.env` ファイルを作成し、必要な情報を追記してください。

> **Note:** 現在このプロジェクトでは設定ファイルが必須かどうか確認中です。

#### Google SheetsのIDやLINEのアクセストークンなど、秘密情報を管理する場合
スクリプトプロパティにGASで使うIDなどを追加してください

手順：

1. Google Sheetsから**スクリプトエディタ（Apps Script）**を開く。（拡張機能メニューなどから）

2. GASプロジェクトのプロジェクト設定（歯車アイコン⚙️）を開く。

3. 「スクリプト プロパティ」セクションで、「スクリプトプロパティを追加」を押し、「プロパティ」「値」の欄に以下のように追加して保存してください。

- SHEET_ID=（Google Sheets の ID）
- LINE_CHANNEL_ACCESS_TOKEN=（LINE チャネルアクセストークン）
- LINE_CHANNEL_SECRET=（LINE チャネルシークレット）
- GMAIL_API_ENABLED=true（メール送信が AppScript 経由で必要な場合）
- OPTIONAL: SERVICE_ACCOUNT_CREDENTIALS (CI で使用するサービスアカウント JSON のパスか内容)

> Google Spread Sheetで使うIDやトークンは.envファイルに書かないでください 

## GASプロジェクトへの反映

### claspでのログイン

Google Apps Scriptにアクセスするため、claspでログインします。

```bash
clasp login
```

詳しい使い方（インストール、認証方法、ビルド→push、CI 設定例など）は [claspガイド](./docs/CLASP_GUIDE.md) を参照してください。

#### ローカルの変更をGoogle環境へ反映 (push)

```bash
clasp push
```

#### Google環境の変更をローカルへ反映 (pull)

```bash
clasp pull
```

> **⚠️ 重要:** `clasp pull` コマンドはローカルの未保存の変更を上書きします。実行前に `git status` で状態を確認し、必要であれば `git stash` で変更を退避させてください。

## 開発ルール

-   ブランチ運用はGit-flowモデルに準拠します。
    -   `main`: 本番用ブランチ
    -   `develop`: 開発用ブランチ
    -   機能追加や修正は `develop` から `feature/` ブランチを切って行います。
-   `develop` ブランチへのマージは、必ずGitHub上でPull Requestを作成し、チームメンバーのレビューを必須とします。

## 貢献

プロジェクトへの貢献を歓迎します！以下の手順でお願いします：

1.  `develop` ブランチから `feature/` ブランチを作成
2.  変更を加えてコミット
3.  GitHub上でPull Requestを作成
4.  チームメンバーのレビューを待つ

詳細は [GitHub利用ガイド](./docs/GITHUB_GUIDE.md) を参照してください。

## ライセンス

本プロジェクトは [MIT License](./LICENSE) のもとで公開されています。