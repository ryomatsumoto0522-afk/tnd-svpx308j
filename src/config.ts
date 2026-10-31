import type { Genre } from "./types.ts";

export type SourceKind = "rss" | "hn" | "hatena";

export interface SourceConfig {
  name: string;
  kind: SourceKind;
  url: string;
  /** ソース自体のジャンル。横断ソースは null（LLM が分類する） */
  genre: Genre | null;
  /** 公式ブログなど。スコアなしで優先枠に入れる */
  official?: boolean;
  /** 1 日あたり候補に入れる最大件数 */
  maxPerRun: number;
  /** 収集対象とする記事の最大経過時間。未指定なら前回実行からの期間。
   * 更新頻度の低いソースは長めにする（掲載済み URL は除くので、同じ記事は二度出ない） */
  maxAgeHours?: number;
}

export const SOURCES: SourceConfig[] = [
  // AI
  {
    name: "Anthropic News",
    kind: "rss",
    // 公式 RSS がないため、コミュニティが公式サイトから生成しているフィードを使う
    url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml",
    genre: "ai",
    official: true,
    maxPerRun: 6,
    maxAgeHours: 96,
  },
  { name: "Google DeepMind", kind: "rss", url: "https://deepmind.google/blog/rss.xml", genre: "ai", official: true, maxPerRun: 6, maxAgeHours: 96 },
  { name: "Google AI Blog", kind: "rss", url: "https://blog.google/technology/ai/rss/", genre: "ai", official: true, maxPerRun: 6 },
  { name: "OpenAI News", kind: "rss", url: "https://openai.com/news/rss.xml", genre: "ai", official: true, maxPerRun: 6 },
  // AI 駆動開発のツール系（Claude Code は公式の CHANGELOG.md が RSS ではないため GitHub Releases の Atom を使う）
  { name: "GitHub Blog（AI）", kind: "rss", url: "https://github.blog/ai-and-ml/feed/", genre: "ai", official: true, maxPerRun: 5, maxAgeHours: 168 },
  { name: "Claude Code", kind: "rss", url: "https://github.com/anthropics/claude-code/releases.atom", genre: "ai", official: true, maxPerRun: 3 },
  { name: "AWS 機械学習ブログ", kind: "rss", url: "https://aws.amazon.com/blogs/machine-learning/feed/", genre: "ai", official: true, maxPerRun: 5, maxAgeHours: 96 },
  { name: "Simon Willison", kind: "rss", url: "https://simonwillison.net/atom/everything/", genre: "ai", maxPerRun: 5 },
  { name: "Zenn（AI）", kind: "rss", url: "https://zenn.dev/topics/ai/feed", genre: "ai", maxPerRun: 6 },
  { name: "Qiita（AI）", kind: "rss", url: "https://qiita.com/tags/ai/feed", genre: "ai", maxPerRun: 5 },
  // フロントエンド（AI 以外は公式リリースを中心に少数）
  { name: "Vue.js Blog", kind: "rss", url: "https://blog.vuejs.org/feed.rss", genre: "frontend", official: true, maxPerRun: 3, maxAgeHours: 96 },
  { name: "Zenn（Vue）", kind: "rss", url: "https://zenn.dev/topics/vue/feed", genre: "frontend", maxPerRun: 3 },
  { name: "Chrome for Developers", kind: "rss", url: "https://developer.chrome.com/static/blog/feed.xml", genre: "frontend", official: true, maxPerRun: 3, maxAgeHours: 96 },
  // バックエンド
  { name: "Spring Blog", kind: "rss", url: "https://spring.io/blog.atom", genre: "backend", official: true, maxPerRun: 3, maxAgeHours: 96 },
  { name: "Inside Java", kind: "rss", url: "https://inside.java/feed.xml", genre: "backend", official: true, maxPerRun: 3, maxAgeHours: 96 },
  // インフラ
  { name: "AWS What's New", kind: "rss", url: "https://aws.amazon.com/about-aws/whats-new/recent/feed/", genre: "infra", official: true, maxPerRun: 3 },
  { name: "AWS News Blog", kind: "rss", url: "https://aws.amazon.com/blogs/aws/feed/", genre: "infra", official: true, maxPerRun: 3 },
  { name: "AWS 日本語ブログ", kind: "rss", url: "https://aws.amazon.com/jp/blogs/news/feed/", genre: "infra", official: true, maxPerRun: 3 },
  // テック（業界ニュース・先端技術。AI 絡みの記事は LLM が ai に分類する）
  { name: "ITmedia NEWS", kind: "rss", url: "https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml", genre: null, maxPerRun: 8 },
  { name: "TechCrunch", kind: "rss", url: "https://techcrunch.com/feed/", genre: null, maxPerRun: 6 },
  { name: "MIT Technology Review", kind: "rss", url: "https://www.technologyreview.com/feed/", genre: null, maxPerRun: 4, maxAgeHours: 96 },
  // 横断（数値で絞れる）
  {
    name: "Hacker News",
    kind: "hn",
    url: "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=60",
    genre: null,
    maxPerRun: 20,
    maxAgeHours: 48,
  },
  {
    name: "はてなブックマーク テクノロジー",
    kind: "hatena",
    url: "https://b.hatena.ne.jp/hotentry/it.rss",
    genre: null,
    maxPerRun: 20,
    maxAgeHours: 48,
  },
];

/** LLM の選定プロンプトに渡す関心プロファイル */
export const INTEREST_PROFILE = `AIに関すること全般を最優先（Claude、Gemini、AI駆動開発、MCP・エージェント、Claude Code・Copilot などのツール）。公式発表（新モデル、API・価格・機能の変更）と、実践記事（使い方・ノウハウ）を同じくらい読みたい。AI 以外は、Java・Spring・Vue・AWS の公式リリースなど実務に直結する更新だけを少数。加えて、世の中の新しいテクノロジー（業界ニュース、半導体・ロボティクス・量子・宇宙などの先端技術）も押さえたい。`;

/** 機械的な事前絞り込み（LLM を使わない段階）でスコアを上げるキーワード */
export const INTEREST_KEYWORDS = [
  "claude", "anthropic", "gemini", "llm", "agent", "エージェント", "mcp", "copilot", "cursor",
  "ai駆動", "生成ai", "openai", "gpt", "claude code", "codex", "プロンプト",
  "java", "spring", "kotlin", "jdk",
  "vue", "nuxt", "vite", "typescript",
  "aws", "lambda", "bedrock", "ecs", "terraform", "kubernetes",
];

export const PIPELINE = {
  /** 機械的な絞り込み後にLLMへ渡す候補数 */
  shortlistSize: 80,
  /** 1 日に表示する記事数（10 分で読める量） */
  totalItems: 20,
  /** LLM に順位付きで返させる件数（本文取得に失敗した分の控えを含む） */
  selectionSize: 36,
  /** ジャンルごとの上限（合計が totalItems 以上になるようにしてある。AI 中心） */
  genreCaps: { ai: 13, backend: 3, frontend: 3, infra: 3, tech: 3, other: 1 } as Record<Genre, number>,
  /** 要約に渡す本文の最大文字数（費用に直結する） */
  bodyChars: 4000,
  /** 本文がこれより短いと取得失敗（ペイウォールやボット対策の可能性）として扱う */
  minBodyChars: 400,
  /** 前回実行からの対象期間の下限・上限（時間） */
  minWindowHours: 24,
  maxWindowHours: 72,
  /** 通知済み URL を覚えておく日数 */
  seenRetentionDays: 30,
};

/**
 * 100 万トークンあたりの USD 単価。
 * Gemini は無料枠で使う前提なので 0。有料枠に切り替えたら実際の単価に直すこと。
 */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "gemini-3.5-flash-lite": { input: 0, output: 0 },
  "gemini-3.8-flash": { input: 0, output: 0 },
  "gemini-3.7-flash": { input: 0, output: 0 },
  "gemini-3.6-flash": { input: 0, output: 0 },
  "gemini-3.1-flash-lite": { input: 0, output: 0 },
};

/** 費用の概算表示に使う為替レート（円/USD）。厳密でなくてよい */
export const JPY_PER_USD = 155;
