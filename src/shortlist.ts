import { INTEREST_KEYWORDS, type SourceConfig } from "./config.ts";
import type { Candidate } from "./types.ts";
import { normalizeUrl } from "./util.ts";

export function keywordHits(c: Pick<Candidate, "title" | "excerpt">): number {
  const text = `${c.title} ${c.excerpt}`.toLowerCase();
  return INTEREST_KEYWORDS.filter((k) => text.includes(k)).length;
}

/**
 * 同じ記事を複数ソースから集めた場合に 1 件へまとめ、掲載済みの記事を除く。
 * 複数のソースに載った記事は話題性の手がかりになるので alsoOn に残す。
 */
export function mergeAndFilter(raw: Candidate[], seen: Record<string, string>): Candidate[] {
  const byUrl = new Map<string, Candidate>();
  const keyByTitle = new Map<string, string>();
  for (const c of raw) {
    const urlKey = normalizeUrl(c.url);
    if (urlKey in seen) continue;
    // URL が違っても、タイトルが同じなら同じ記事として扱う（ブックマークサービス経由の別 URL など）
    const titleKey = c.title.toLowerCase().replace(/[\s\p{P}]+/gu, "");
    const key = (titleKey.length >= 8 ? keyByTitle.get(titleKey) : undefined) ?? urlKey;
    if (titleKey.length >= 8 && !keyByTitle.has(titleKey)) keyByTitle.set(titleKey, key);
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, { ...c, alsoOn: [...c.alsoOn] });
      continue;
    }
    // 公式ソースや本文付きのフィードを優先して残す
    const keepNew = (!existing.official && c.official) || (!existing.feedContent && c.feedContent && !existing.official);
    const base = keepNew ? { ...c, alsoOn: [...c.alsoOn] } : existing;
    const other = keepNew ? existing : c;
    base.alsoOn = [...new Set([...base.alsoOn, other.source, ...other.alsoOn])].filter((s) => s !== base.source);
    base.score = Math.max(base.score ?? -1, other.score ?? -1);
    if (base.score < 0) base.score = null;
    byUrl.set(key, base);
  }
  return [...byUrl.values()];
}

/**
 * LLM を使わずに候補を size 件まで絞る。
 * - ソースごとに上限（maxPerRun）まで。数値のあるソースはポイント順、それ以外は関心キーワード→新しい順
 * - 公式ソースは優先枠として先に入れる（数値がなく、バズ記事に埋もれさせないため）
 */
export function shortlist(cands: Candidate[], sources: SourceConfig[], size: number): Candidate[] {
  const capBySource = new Map(sources.map((s) => [s.name, s.maxPerRun]));
  const bySource = new Map<string, Candidate[]>();
  for (const c of cands) {
    const list = bySource.get(c.source) ?? [];
    list.push(c);
    bySource.set(c.source, list);
  }

  const ranked: { c: Candidate; rank: number }[] = [];
  for (const [name, list] of bySource) {
    const cap = capBySource.get(name) ?? 5;
    const sorted = [...list].sort((a, b) => {
      if (a.score !== null && b.score !== null && a.score !== b.score) return b.score - a.score;
      const kw = keywordHits(b) - keywordHits(a);
      if (kw !== 0) return kw;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
    sorted.slice(0, cap).forEach((c, i) => {
      const base = 1 - i / cap;
      const bonus = 0.25 * Math.min(keywordHits(c), 2) + (c.alsoOn.length > 0 ? 0.3 : 0);
      ranked.push({ c, rank: base + bonus });
    });
  }

  ranked.sort((a, b) => {
    if (a.c.official !== b.c.official) return a.c.official ? -1 : 1;
    return b.rank - a.rank;
  });
  return ranked.slice(0, size).map((r) => r.c);
}
