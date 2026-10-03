# tech-news-digest

毎朝、AI・フロントエンド・バックエンド・インフラの技術ニュースを集め、日本語で要約して、出典リンク付きの 1 枚のページにまとめる個人用ツールです。

- 公式ブログ・Hacker News・はてブ・Zenn・Qiita などの RSS / API から収集
- 機械的に約 60 件へ絞り、LLM（軽量モデル）が関心プロファイル（`src/config.ts`）に沿って選定
- 選んだ記事の本文を取得し、LLM が丁寧な日本語で要約（用語メモ付き）
- LLM は既定で Gemini の無料枠（選定 `gemini-3.5-flash-lite`、要約 `gemini-3.8-flash`）。環境変数で Claude API にも切り替えられる
- 本文を取得できない記事、要約できない記事は、次点の記事に自動で差し替え
- `docs/` に静的ページを生成し、GitHub Pages で公開。完了と失敗は Resend でメール通知

## セットアップ

1. リポジトリの Settings → Secrets and variables → Actions に次を登録する。
   - `GEMINI_API_KEY`: Google AI Studio（https://aistudio.google.com/apikey）で発行する API キー。無料枠で使えて、カード登録は不要
   - `RESEND_API_KEY`: Resend の API キー（送信専用）
   - `MAIL_TO`: 通知の宛先（Resend に登録したメールアドレス）
2. Settings → Pages で Source を「Deploy from a branch」、Branch を `main` / `/docs` にする。
3. Actions タブから `daily-digest` を手動実行（Run workflow）して動作を確かめる。以降は毎朝 未明（02:17 / 03:47 / 05:17 JST の最大 3 回。生成済みならスキップ）に自動で動き、メールは 7:00 JST に届くよう予約送信する。

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

## LLM と費用

| `LLM_PROVIDER` | 使うモデル | 費用 | 必要な Secret |
|---|---|---|---|
| `gemini`（既定） | 選定 `gemini-3.5-flash-lite` / 要約 `gemini-3.8-flash` | 無料枠（0 円） | `GEMINI_API_KEY` |
| `anthropic` | 選定 `claude-haiku-4-5` / 要約 `claude-sonnet-5-5` | 従量課金（月 1,000 円前後の見込み） | `ANTHROPIC_API_KEY` |

- 切り替えは、リポジトリの Settings → Secrets and variables → Actions → Variables に `LLM_PROVIDER` を作って値を設定します（ローカルでは環境変数）。
- モデル名は `src/providers.ts`、単価は `src/config.ts` の `PRICES` にあります。
- **Gemini の無料枠では、入力した内容が Google の製品改善に使われ得ます。** このツールが送るのは公開記事の本文と関心プロファイルだけです。機密を含む記事を扱うようにしたら、有料枠か Claude に切り替えてください。
- 無料枠には **1 分あたり 5 回、1 日あたり 20 回（モデルごと）** のリクエスト上限があります。そのため、要約は記事を 4 件ずつまとめて 1 回のリクエストで行い、1 日の呼び出しを 10 回前後に抑えています。
- 1 分あたりの上限に当たったら、API が示す待ち時間に従って再試行します。1 日の上限に当たったら、同じ無料枠の別モデル（`gemini-3.7-flash` など）に自動で切り替えます。すべて使い切った場合は、原因を明記して失敗します。
- 手動での再実行（`force`）やテストは、1 日の上限を消費します。続けて何度も実行しないでください。
- ページ上部に、その日の費用（無料枠なら「0円」）を表示します。

## 注意

- 公開リポジトリ + GitHub Pages の構成なので、ページは URL を知っていれば誰でも見られます（`noindex` と `robots.txt` で検索には出さない設定）。
- 要約は LLM が生成します。各記事の出典リンクで原文を確認してください。
