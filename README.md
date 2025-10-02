# スチームコモンズ 物品管理システム

## 概要

本プロジェクトは、ものづくり環境「スチームコモンズ」内の放置物品問題を解決するための管理システムです。

利用者がQRコードから簡単に物品を登録し、設定した撤去予定日（明け渡し日）に基づき自動でリマインダーを送信します。これにより、所有者を明確化し、スペースの公平かつ効率的な利用を促進することを目的とします。

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

## 環境構築

1.  **リポジトリのクローン**
    ```bash
    git clone [リポジトリのURL]
    cd [プロジェクト名]
    ```

2.  **依存パッケージのインストール**
    ```bash
    npm install
    ```

3.  **claspでのログイン**
    ```bash
    clasp login
    ```

4.  **設定ファイルの作成**
    -   Google SheetsのIDやLINEのアクセストークンなど、秘密情報を管理します。
    -   `.env.sample` ファイルをコピーして `.env` ファイルを作成し、必要な情報を追記してください。

5.  **GASプロジェクトへの反映**
    ```bash
    clasp push
    ```

## 開発ルール

-   ブランチ運用はGit-flowモデルに準拠します。
    -   `main`: 本番用ブランチ
    -   `develop`: 開発用ブランチ
    -   機能追加や修正は `develop` から `feature/` ブランチを切って行います。
-   `develop` ブランチへのマージは、必ずGitHub上でPull Requestを作成し、チームメンバーのレビューを必須とします。

## ライセンス

[ここにはライセンスを記述します。よくわからなければ MIT License などが一般的です。]