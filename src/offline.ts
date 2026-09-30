import type { Candidate, Genre } from "./types.ts";

const RULES: [Genre, string[]][] = [
  ["ai", ["ai", "llm", "claude", "gemini", "gpt", "openai", "anthropic", "agent", "エージェント", "生成", "model", "モデル"]],
  ["frontend", ["vue", "react", "css", "browser", "chrome", "frontend", "フロントエンド", "javascript", "typescript", "web"]],
  ["infra", ["aws", "kubernetes", "docker", "terraform", "cloud", "インフラ", "lambda", "ec2", "s3", "network"]],
  ["backend", ["java", "spring", "kotlin", "database", "sql", "api", "backend", "バックエンド", "jvm", "rust", "go "]],
];

/** ソースのジャンルがなければキーワードで推定する（オフライン時の代替。通常は LLM が分類する） */
export function guessGenre(c: Candidate): Genre {
  if (c.genreHint) return c.genreHint;
  const text = `${c.title} ${c.excerpt}`.toLowerCase();
  for (const [genre, words] of RULES) {
    if (words.some((w) => text.includes(w))) return genre;
  }
  return "other";
}
