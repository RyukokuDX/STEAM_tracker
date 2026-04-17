# スチームコモンズ 物品管理システム

## 概要

本プロジェクトは、ものづくり環境「スチームコモンズ」内の放置物品問題を解決するための管理システムです。

利用者がQRコードから簡単に物品を登録し、設定した撤去予定日（明け渡し日）に基づき自動でリマインダーを送信します。これにより、所有者を明確化し、スペースの公平かつ効率的な利用を促進することを目的とします。

## ドキュメント
このプロジェクトに関する詳細なドキュメントは、すべてdocsフォルダに格納されています。

-   **[GitHub利用ガイド](./docs/GITHUB_GUIDE.md)** — 本プロジェクトにおけるGit/GitHubの運用ルール
-   **[プロジェクト要件定義書](./docs/REQUIREMENTS.md)** — プロジェクトの目的、要件、仕様の定義
-   **[要件仕様書](./docs/SPECIFICATIONS.md)** — 各機能の動作仕様（モジュール構成・処理・トリガー等）
-   **[登録フォーム仕様書](./docs/FORM_REQUIREMENTS.md)** — 物品登録フォームの仕様
-   **[延長申請フォーム仕様書](./docs/EXTEND_FORM_SPECIFICATION.md)** — 延長申請フォームの仕様
-   **[LINE Bot仕様書](./docs/LINE_BOT_SPECIFICATION.md)** — LINE通知/Webhookの仕様
-   **[clasp ガイド](./docs/CLASP_GUIDE.md)** — clasp を使った Apps Script のローカル開発・デプロイ手順

## 主な機能

-   **利用者向け機能**
    -   Web フォーム経由での物品登録（所有者情報、物品情報、写真、明け渡し日）
    -   明け渡し日前のリマインダーメール受信
    -   Web フォーム経由での延長申請（管理者の許可/却下後にメール通知）
-   **管理者向け機能**
    -   LINE による物品登録通知 / 明け渡しリマインド通知
    -   LINE のボタン操作（postback）による延長申請の許可/却下
    -   管理ダッシュボードによる登録物品の一覧・検索（`dashboard/`）

## アーキテクチャ（使用技術）

-   **Backend / Automation**: Google Apps Script (GAS)
-   **Database**: Google Sheets
-   **User Registration UI**: Apps Script + 静的HTML（Webアプリ）
-   **Admin Interface**: LINE Messaging API（Push + Webhook postback）、管理ダッシュボード
-   **Development Tool**: clasp, Git, GitHub

## プロジェクト構造

```
STEAM_tracker/
├── docs/                                     # プロジェクトドキュメント
│   ├── CLASP_GUIDE.md                        # claspガイド
│   ├── GITHUB_GUIDE.md                       # Git/GitHub運用ガイド
│   ├── COMMIT_MESSAGE_SPECIFICATION.md       # コミットメッセージの仕様
│   ├── COMMIT_MESSAGE_AS_CODE_GUIDE.md       # コミットメッセージ駆動開発のガイド
│   ├── PULL_REQUESTS_COMMENT_SPECIFICATION.md # プルリクエストの仕様
│   ├── REQUIREMENTS.md                       # 要件定義書
│   ├── SPECIFICATIONS.md                     # 要件仕様書
│   ├── FORM_REQUIREMENTS.md                  # 登録フォーム仕様書
│   ├── EXTEND_FORM_SPECIFICATION.md          # 延長申請フォーム仕様書
│   ├── LINE_BOT_SPECIFICATION.md             # LINE Bot仕様書
│   ├── LINE_NOTIFICATION_ISSUES.md           # LINE通知の問題点調査・改良記録
│   ├── APP_SHEET.md                          # ダッシュボード仕様書
│   ├── GAS_REQUIREMENTS.md                   # GAS仕様書
│   ├── SPREAD_SHEET_REQUIREMENTS.md          # スプレッドシート仕様書
│   ├── GUIDELINE.md                          # 開発ガイドライン
│   └── NPM_TEST_HOWTO.md                     # npmテストガイド
│
├── stuffForm/                                # 物品登録フォーム（Webアプリ）
│   ├── GAS/code.js
│   └── index.html
├── extend_form/                              # 延長申請フォーム（Webアプリ + LINE Webhook）
│   ├── GAS/code.js
│   └── index.html
├── line_bot/                                 # LINE Bot（登録通知・リマインド）
│   └── GAS/code.js
├── dashboard/                                # 管理ダッシュボード
│   ├── code.js
│   ├── index.html
│   ├── index-demo.html
│   └── style.html
├── .github/                                  # GitHub Actions / PR テンプレート
├── .commits/                                 # commit-message-as-code 履歴
├── .gitignore
├── LICENSE
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

共通（`line_bot/`、`extend_form/` の GAS プロジェクトに設定）：

- `ACCESS_TOKEN` =（LINE チャネルアクセストークン）
- `USER_ID` =（通知先となる管理者のLINEユーザーID）
- `SPREAD_SHEET_ID` =（管理シートのSpreadsheet ID）
- `SHEET_NAME_MANAGE` =（管理シート名）

`line_bot/` 固有：

- `FORM_URL` =（延長申請フォームのURL、リマインドメール本文に埋め込む）

`extend_form/` 固有：

- `LINE_WEBHOOK_TOKEN` =（LINE Webhook の検証用トークン、optional だが本番では必須）

上記のいずれかが未設定の場合、起動時に `getRequiredProperty` が明示的なエラーを投げて停止する（`LINE_WEBHOOK_TOKEN` は未設定時に検証スキップされるが本番非推奨）。

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