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
-   **利用者UI**: Webアプリ（`stuffForm` / `extend_form` ほか）とブラウザフォーム
-   **管理者UI**: LINE Messaging API、GAS Webアプリ（`dashboard`）、AppSheet
-   **Development Tool**: clasp, Git, GitHub

## プロジェクト構造

```
STEAM_tracker/
├── docs/                                     # プロジェクトドキュメント
│   ├── CLASP_GUIDE.md                        # claspガイド
│   ├── GITHUB_GUIDE.md                       # Git/GitHub運用ガイド
│   ├── COMMIT_MESSAGE_SPECIFICATION.md       # コミットメッセージの仕様
│   ├── FORM_REQUIREMENTS.md                  # フォーム仕様書
│   ├── GAS_REQUIREMENTS.md                   # GAS 連携仕様
│   ├── COMMIT_MESSAGE_AS_CODE_GUIDE.md       # コミットメッセージ駆動開発のガイド
│   ├── PULL_REQUESTS_COMMENT_SPECIFICATION.md # プルリクエストの仕様
│   ├── PULLREQUESTS_COMMENT_SPECIFICATION.md
│   ├── REQUIREMENTS.md                       # 要件定義書
│   ├── APP_SHEET.md                          # AppSheet 仕様
│   ├── SPECIFICATIONS.md                     # 要件仕様書
│   └── SPREAD_SHEET_REQUIREMENTS.md          # スプレッドシート仕様書
├── stuffForm/                                # 物品登録 Web アプリ（GAS）
│   └── GAS/
├── extend_form/                              # 延長申請（GAS）
│   └── GAS/
├── line_bot/                                 # LINE 通知・リマインド（GAS）
│   └── GAS/
├── dashboard/                                # 管理者ダッシュボード（GAS）
├── GAS/                                      # レガシー試作スクリプト（参考）
├── .github/workflows/                        # CI（例: デプロイ）
├── .claspignore                              # clasp push から除外するパス
├── .gitignore
├── LICENSE
└── README.md
```

## 環境構築

### 1. リポジトリのクローン

HTTPS:

```bash
git clone https://github.com/RyukokuDX/STEAM_tracker.git
cd STEAM_tracker
```

SSH:

```bash
git clone git@github.com:RyukokuDX/STEAM_tracker.git
cd STEAM_tracker
```

### 2. claspでのログイン

Google Apps Script にアクセスするため、clasp でログインします。

```bash
clasp login
```

詳しい使い方（インストール、認証方法、ビルド→push、CI 設定例など）は [claspガイド](./docs/CLASP_GUIDE.md) を参照してください。

### 3. 設定と秘密情報

各 GAS プロジェクト（`stuffForm` / `extend_form` / `line_bot` / `dashboard` など）のディレクトリで `clasp clone` 済みの `.clasp.json` を用意したうえで作業します。

-   Google Sheets の ID、LINE チャネルシークレット等の**機密値は、リポジトリにコミットせず**、Apps Script の**スクリプトプロパティ**または GitHub Actions の Secrets で管理してください。
-   ローカル用に `.env` を使う場合は `.env.sample` をコピーして `.env` を作成し、CI や clasp 以外のツール向けの値のみを記載してください。

スクリプトプロパティの設定手順の概要:

1. Google Sheets から**拡張機能 → Apps Script**（または対象の GAS エディタ）を開く。
2. 左メニューの**プロジェクトの設定**（歯車）を開く。
3. **スクリプト プロパティ**に、各 `code.js` のドキュメントや `getRequiredProperty` が参照するキーを追加する。

> **重要:** スプレッドシート ID や LINE トークンを `.env` に置いて Git に含めないでください（誤コミット防止のため）。

### 4. GAS プロジェクトへの反映

対象モジュールのディレクトリ（例: `stuffForm`）に移動してから実行します。

#### ローカルの変更を Google 環境へ反映 (push)

```bash
cd stuffForm
clasp push
```

#### Google 環境の変更をローカルへ反映 (pull)

```bash
clasp pull
```

> **注意:** `clasp pull` はローカルの未保存変更を上書きします。実行前に `git status` を確認し、必要なら `git stash` で退避してください。

## 開発ルール

-   ブランチ運用は Git-flow モデルに準拠します。
    -   `main`: 本番用ブランチ
    -   `develop`: 開発用ブランチ
    -   機能追加や修正は `develop` から `feature/` ブランチを切って行います。
-   `develop` ブランチへのマージは、GitHub 上で Pull Request を作成し、チームレビューを原則とします。

## 貢献

プロジェクトへの貢献を歓迎します。以下の手順でお願いします。

1.  `develop` ブランチから `feature/` ブランチを作成する
2.  変更を加えてコミットする
3.  GitHub 上で Pull Request を作成する
4.  チームメンバーのレビューを待つ

詳細は [GitHub利用ガイド](./docs/GITHUB_GUIDE.md) を参照してください。

## ライセンス

本プロジェクトは [MIT License](./LICENSE) のもとで公開されています。
