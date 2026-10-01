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
  { name: "Simon Willison", kind: "rss", url: "https://simonwillison.net/atom/everything/", genre: "ai", maxPerRun: 5 },
  { name: "Zenn（AI）", kind: "rss", url: "https://zenn.dev/topics/ai/feed", genre: "ai", maxPerRun: 5 },
  { name: "Qiita（AI）", kind: "rss", url: "https://qiita.com/tags/ai/feed", genre: "ai", maxPerRun: 5 },
  // フロントエンド
  { name: "Vue.js Blog", kind: "rss", url: "https://blog.vuejs.org/feed.rss", genre: "frontend", official: true, maxPerRun: 6, maxAgeHours: 96 },
  { name: "Zenn（Vue）", kind: "rss", url: "https://zenn.dev/topics/vue/feed", genre: "frontend", maxPerRun: 5 },
  { name: "Chrome for Developers", kind: "rss", url: "https://developer.chrome.com/static/blog/feed.xml", genre: "frontend", official: true, maxPerRun: 6, maxAgeHours: 96 },
  // バックエンド
  { name: "Spring Blog", kind: "rss", url: "https://spring.io/blog.atom", genre: "backend", official: true, maxPerRun: 6, maxAgeHours: 96 },
  { name: "Inside Java", kind: "rss", url: "https://inside.java/feed.xml", genre: "backend", official: true, maxPerRun: 6, maxAgeHours: 96 },
  { name: "InfoQ", kind: "rss", url: "https://feed.infoq.com/", genre: null, maxPerRun: 5 },
  // インフラ
  { name: "AWS What's New", kind: "rss", url: "https://aws.amazon.com/about-aws/whats-new/recent/feed/", genre: "infra", official: true, maxPerRun: 6 },
  { name: "AWS News Blog", kind: "rss", url: "https://aws.amazon.com/blogs/aws/feed/", genre: "infra", official: true, maxPerRun: 6 },
  { name: "AWS 日本語ブログ", kind: "rss", url: "https://aws.amazon.com/jp/blogs/news/feed/", genre: "infra", official: true, maxPerRun: 6 },
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
export const INTEREST_PROFILE = `Claude、Gemini、Java、Vue、AWS、Spring、AI駆動開発など、AIに関すること全般。`;

/** 機械的な事前絞り込み（LLM を使わない段階）でスコアを上げるキーワード */
export const INTEREST_KEYWORDS = [
  "claude", "anthropic", "gemini", "llm", "agent", "エージェント", "mcp", "copilot", "cursor",
  "ai駆動", "生成ai", "openai", "gpt",
  "java", "spring", "kotlin", "jdk",
  "vue", "nuxt", "vite", "typescript",
  "aws", "lambda", "bedrock", "ecs", "terraform", "kubernetes",
];

export const PIPELINE = {
  /** 機械的な絞り込み後にLLMへ渡す候補数 */
  shortlistSize: 60,
  /** 1 日に表示する記事数（10 分で読める量） */
  totalItems: 20,
  /** LLM に順位付きで返させる件数（本文取得に失敗した分の控えを含む） */
  selectionSize: 32,
  /** ジャンルごとの上限（合計が totalItems 以上になるようにしてある） */
  genreCaps: { ai: 7, backend: 5, frontend: 5, infra: 5, other: 2 } as Record<Genre, number>,
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
};

/** 費用の概算表示に使う為替レート（円/USD）。厳密でなくてよい */
export const JPY_PER_USD = 155;
