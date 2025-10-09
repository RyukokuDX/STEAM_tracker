## clasp ガイド

このドキュメントは Google Apps Script (GAS) をローカルで開発・管理するための `clasp` の使い方をまとめたものです。

対象: ローカル開発者、CI 環境での自動デプロイ担当者

前提: Node.js / npm がインストールされていること（推奨: Node.js 16 以上）

### 1. clasp のインストール

開発マシンにグローバルインストールする例（PowerShell）:

```powershell
npm install -g @google/clasp
```

プロジェクトローカルに入れる場合（npx で実行する想定）:

```powershell
npm install --save-dev @google/clasp
```

グローバルインストールを避ける場合は `npx clasp <command>` を利用できます。

### 2. 認証 / ログイン

開発者個人でブラウザ認証を行う:

```powershell
clasp login
```

ヘッドレス環境やブラウザが使えない場合:

```powershell
clasp login --no-localhost
```

CI で自動デプロイする際はサービスアカウントを使った認証を推奨します（GCP でサービスアカウントを作成し、Apps Script API を有効化しておく）。サービスアカウント JSON を使用してログイン:

```powershell
clasp login --creds ./path/to/service-account.json
```

注意: サービスアカウントに必要な権限（プロジェクトの Editor など）を付与すること。

### 3. プロジェクトの作成 / 既存プロジェクトのリンク

- 新規 GAS プロジェクトを作成してローカルと連携する:

```powershell
clasp create --title "STEAM_tracker" --type standalone --rootDir dist
```

- 既存の Apps Script (scriptId がある) をローカルにクローンする:

```powershell
clasp clone <SCRIPT_ID>
```

実行するとプロジェクトルートに `.clasp.json` が生成されます。例:

```json
{
	"scriptId": "1A2b3C...",
	"rootDir": "dist"
}
```

`rootDir` はローカルでビルドした成果物（例: TypeScript の出力先）を指します。

### 4. .claspignore

GAS にアップロードしたくないファイルを `.claspignore` に記述します。例:

```
node_modules/
src/
.env
*.map
```

`.claspignore` を適切に設定しないと不要なファイルを GAS に push してしまったり、逆に必要なファイルを含め忘れることがあります。

### 5. ローカルでの開発ワークフロー（TypeScript を使う場合）

1. TypeScript のソースを `src/` に置く
2. `tsconfig.json` を用意して `outDir` を `dist/` に設定
3. ビルドして `dist/` に出力
4. clasp push で GAS に反映

package.json に便利なスクリプト例:

```json
{
	"scripts": {
		"build": "tsc",
		"push": "npm run build && npx clasp push",
		"pull": "npx clasp pull"
	},
	"devDependencies": {
		"@google/clasp": "^3.0.0",
		"typescript": "^5.0.0"
	}
}
```

ローカル反映コマンド:

```powershell
npm run push
```

GAS サーバー側の変更を取り込む:

```powershell
clasp pull
```

編集済みファイルを Apps Script エディタで表示する場合:

```powershell
clasp open
```

### 6. デプロイ / バージョン管理

Apps Script の公開用デプロイを作成するには:

```powershell
clasp deploy --description "release v1.0"
```

デプロイ後に返されるデプロイIDや Web アプリの URL は必要に応じてドキュメント化してください。

### 7. CI / 自動デプロイのヒント

- サービスアカウント JSON を GitHub Secrets に保存し、ワークフロー内でファイルに書き出して `clasp login --creds ./sa.json` を実行するパターンが一般的です。
- 例ワークフローの流れ（要約）:
	1. リポジトリチェックアウト
	2. Node.js セットアップ
	3. secrets からサービスアカウント JSON をファイル化
	4. npx clasp login --creds ./sa.json
	5. npm ci && npm run build
	6. npx clasp push

注意: GitHub Actions 等で実行する場合、サービスアカウントに Apps Script API の権限と対象プロジェクトへのアクセスが必要です。

### 8. よくあるトラブルと対処

- clasp login が失敗する: ブラウザでの認証をやり直す。CI の場合は creds ファイルの内容が正しいか確認。
- .clasp.json の scriptId が間違っている: 正しい scriptId を指定して再 clone するか、手動で `.clasp.json` を修正。
- push しても反映されない: `rootDir` が正しいか、`.claspignore` で必要ファイルを除外していないかを確認。
- 実行時にスコープ不足エラー: GCP コンソールで該当 API を有効化し、必要な権限をスクリプトプロジェクトに付与する。

### 9. チェックリスト（導入時）

- [ ] Node.js と npm がインストールされている
- [ ] clasp がインストール／もしくは npx で利用可能
- [ ] `.env.sample` をコピーして `.env` を作成（必要なキーを設定）
- [ ] `.clasp.json` の `scriptId` と `rootDir` を確認
- [ ] 必要な GCP API（Apps Script API, Sheets API など）を有効化
- [ ] CI 用にサービスアカウントを作成し、Secrets に登録（必要な場合）

---

補足: README に書かれている簡易手順（`clasp login` / `clasp push` 等）はこのガイドの抜粋です。ここに詳しい手順を置いてあるので、具体的なエラー対応や CI の雛形を求める場合はさらに追記できます。

