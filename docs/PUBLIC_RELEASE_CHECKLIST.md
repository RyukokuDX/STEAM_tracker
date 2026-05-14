# 公開直前チェックリスト（短版）

リポジトリを **Public** にする直前に、担当者が順に確認する用です。

---

## 1. README

- [ ] **クローン手順**（HTTPS / SSH）が意図どおりか。
- [ ] **ドキュメントへのリンク**が切れていない（特に `docs/` 配下）。
- [ ] **秘密情報を書かない**方針が README 上も一貫している（トークン・鍵の実値がない）。
- [ ] **ライセンス**（`LICENSE`）と README の記述が矛盾していない。

---

## 2. GitHub Secrets（Actions）

リポジトリ **Settings → Secrets and variables → Actions** で確認。

| Secret | 用途（ワークフロー） |
|--------|----------------------|
| `EXTEND_GAS_URL` | `.github/workflows/deploy.yml` … `extend_form/index.html` の `%%EXTEND_GAS_URL%%` 置換 |
| `STUFF_GAS_URL` | 同上 … `stuffForm/index.html` の `%%STUFF_GAS_URL%%` 置換 |
| `TEAMS_WEBHOOK` | `.github/workflows/teams-notification.yml`（未設定なら当該ジョブは失敗しうる） |

- [ ] **`EXTEND_GAS_URL` / `STUFF_GAS_URL` が設定済み**（Pages デプロイ用）。
- [ ] Teams 通知を使う場合 **`TEAMS_WEBHOOK` が設定済み**（使わないならワークフロー無効化や条件分岐の検討）。
- [ ] **`GITHUB_TOKEN`** は既定で利用可能（通常は追加設定不要）。

---

## 3. GitHub Pages とデプロイ動作

- [ ] **Settings → Pages** で公開元を決める（`peaceiris/actions-gh-pages` は既定で **`gh-pages` ブランチ** に publish する想定。組織方針に合わせて「Deploy from a branch」または Actions 連携を確認）。
- [ ] **Actions の権限**: 必要なら **Settings → Actions → General** でワークフロー実行と Pages 書き込みが許可されているか。
- [ ] **`main` へマージ / プッシュ後**にワークフロー **Deploy to GitHub Pages** が **成功**している。
- [ ] 公開 URL 上で **`stuffForm` / `extend_form` の静的 HTML** を開き、フォーム送信先が **本番 GAS の Web アプリ URL** になっているか（プレースホルダが残っていないか）。

---

## 4. リポジトリ公開そのもの

- [ ] **Visibility を Public** に変更（管理者のみ）。
- [ ] **Branch protection**（`main` / `develop`）が公開後も意図どおりか。
- [ ] **不要なリモートブランチ**が残っていないか（運用ポリシーに従う）。

---

## 5. 任意（セキュリティ）

- [ ] ローカルに **`dashboard/credentials/*.json`** 等がある場合、**誤コミットしない**（`.gitignore` 済みでも `git add -f` に注意）。
- [ ] 公開後に **GAS 側のスクリプトプロパティ**・**スプレッドシート共有範囲**を再確認する。
