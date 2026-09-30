# tech-news-digest

毎朝、AI・フロントエンド・バックエンド・インフラの技術ニュースを集め、日本語で要約して、出典リンク付きの 1 枚のページにまとめる個人用ツールです。

- 公式ブログ・Hacker News・はてブ・Zenn・Qiita などの RSS / API から収集
- 機械的に約 60 件へ絞り、Claude Haiku 4.5 が関心プロファイル（`src/config.ts`）に沿って選定
- 選んだ記事の本文を取得し、Claude Sonnet 5.5 が丁寧な日本語で要約（用語メモ付き）
- 本文を取得できない記事、要約できない記事は、次点の記事に自動で差し替え
- `docs/` に静的ページを生成し、GitHub Pages で公開。完了と失敗は Resend でメール通知

## セットアップ

1. リポジトリの Settings → Secrets and variables → Actions に次を登録する。
   - `ANTHROPIC_API_KEY`: Anthropic の API キー
   - `RESEND_API_KEY`: Resend の API キー（送信専用）
   - `MAIL_TO`: 通知の宛先（Resend に登録したメールアドレス）
2. Settings → Pages で Source を「Deploy from a branch」、Branch を `main` / `/docs` にする。
3. Actions タブから `daily-digest` を手動実行（Run workflow）して動作を確かめる。以降は毎朝 06:00 JST に自動で動く。

## ローカルで試す

```bash
npm install
npm run build:offline   # LLM なし。収集・絞り込み・本文取得・ページ生成を確認できる（.preview/docs に出力）
npm run build           # 本番の処理（ANTHROPIC_API_KEY が必要。data/ と docs/ に書き込む）
npm run build -- --force   # 今日の分が生成済みでも作り直す
npm run build -- --rerender   # LLM を使わず、保存済みデータからページだけ作り直す
npm test
```

## 調整するところ（`src/config.ts`）

| 設定 | 内容 |
|---|---|
| `SOURCES` | 取得元の追加・削除。`maxPerRun` は 1 日に候補へ入れる上限 |
| `INTEREST_PROFILE` | LLM が選定するときの関心プロファイル |
| `PIPELINE.totalItems` / `genreCaps` | 1 日の記事数、ジャンルごとの上限 |
| `PIPELINE.bodyChars` | 要約に渡す本文の最大文字数。費用に直結する |
| `MODELS` | 選定と要約に使うモデル |

## 費用

ページ上部に、その日の LLM 費用の概算を表示します。月の目標は 1,000 円です。超えそうなら、`totalItems` か `bodyChars` を下げるか、`MODELS.summary` を `claude-haiku-4-5` に変えてください。

## 注意

- 公開リポジトリ + GitHub Pages の構成なので、ページは URL を知っていれば誰でも見られます（`noindex` と `robots.txt` で検索には出さない設定）。
- 要約は LLM が生成します。各記事の出典リンクで原文を確認してください。
