export const GENRES = ["ai", "backend", "frontend", "infra", "other"] as const;
export type Genre = (typeof GENRES)[number];

/** タブの表示順もこの並びに従う（AI → バックエンド → フロントエンド → インフラ → その他） */
export const GENRE_LABEL: Record<Genre, string> = {
  ai: "AI",
  backend: "バックエンド",
  frontend: "フロントエンド",
  infra: "インフラ",
  other: "その他",
};

/** フィードや API から集めた生の記事候補 */
export interface Candidate {
  url: string;
  title: string;
  source: string;
  genreHint: Genre | null;
  /** 公式ブログなど、数値で絞らず優先枠として扱うソース */
  official: boolean;
  publishedAt: string;
  excerpt: string;
  /** フィードに全文が載っている場合の本文（本文取得に失敗したときの代替に使う） */
  feedContent: string;
  /** HN のポイントやはてブ数。数値のないソースは null */
  score: number | null;
  /** 同じ URL が載っていた他のソース名 */
  alsoOn: string[];
}

export interface GlossaryEntry {
  term: string;
  explanation: string;
}

export interface DigestItem {
  rank: number;
  url: string;
  title: string;
  source: string;
  genre: Genre;
  publishedAt: string;
  /** 全文の要約。新形式ではポイントをつなげたもの。旧データや構造化できない場合の表示に使う */
  summary: string;
  /** ひとこと見出し（新形式のみ） */
  headline?: string;
  /** 要点（2〜3 個。新形式のみ） */
  points?: string[];
  /** 誰にどう影響するか。本文に書かれている場合だけ入る（新形式のみ） */
  impact?: string;
  glossary: GlossaryEntry[];
  /** full = 記事本文から要約 / feed = フィード掲載の本文から要約 */
  bodyMode: "full" | "feed";
}

export interface DigestStats {
  sourcesOk: number;
  sourcesTotal: number;
  candidates: number;
  shortlisted: number;
  bodyFailures: number;
  summaryFailures: number;
}

export interface DigestCost {
  /** 使った LLM（gemini / anthropic）。古いデータには無い */
  provider?: string;
  usd: number;
  jpy: number;
  inputTokens: number;
  outputTokens: number;
}

export interface DigestDay {
  date: string;
  generatedAt: string;
  items: DigestItem[];
  stats: DigestStats;
  cost: DigestCost;
  /** オフラインプレビューで生成した日（LLM を使っていない） */
  offline: boolean;
}
