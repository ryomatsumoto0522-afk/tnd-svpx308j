import Parser from "rss-parser";
import type { SourceConfig } from "./config.ts";
import type { Candidate } from "./types.ts";
import { isHttpUrl, stripHtml, truncate, USER_AGENT } from "./util.ts";

interface FeedItem {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  contentEncoded?: string;
  bookmarkCount?: string;
}

const parser = new Parser<Record<string, never>, FeedItem>({
  timeout: 20_000,
  headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["hatena:bookmarkcount", "bookmarkCount"],
    ],
  },
});

async function collectRss(src: SourceConfig): Promise<Candidate[]> {
  const feed = await parser.parseURL(src.url);
  const out: Candidate[] = [];
  for (const item of feed.items) {
    if (!item.link || !item.title || !isHttpUrl(item.link)) continue;
    const full = stripHtml(item.contentEncoded ?? item.content ?? "");
    const snippet = stripHtml(item.contentSnippet ?? item.content ?? "");
    const date = item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : undefined);
    const bookmarks = item.bookmarkCount ? Number(item.bookmarkCount) : null;
    out.push({
      url: item.link,
      title: stripHtml(item.title),
      source: src.name,
      genreHint: src.genre,
      official: src.official ?? false,
      publishedAt: date ?? new Date().toISOString(),
      excerpt: truncate(snippet, 400),
      feedContent: full,
      score: src.kind === "hatena" && bookmarks !== null && Number.isFinite(bookmarks) ? bookmarks : null,
      alsoOn: [],
    });
  }
  return out;
}

interface HnHit {
  title?: string;
  url?: string | null;
  points?: number;
  created_at?: string;
  story_text?: string | null;
}

async function collectHn(src: SourceConfig): Promise<Candidate[]> {
  const res = await fetch(src.url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HN API ${res.status}`);
  const json = (await res.json()) as { hits?: HnHit[] };
  const out: Candidate[] = [];
  for (const hit of json.hits ?? []) {
    // 外部記事への URL がない投稿（Ask HN など）は出典として使えないので除く
    if (!hit.url || !hit.title || !isHttpUrl(hit.url)) continue;
    out.push({
      url: hit.url,
      title: hit.title,
      source: src.name,
      genreHint: src.genre,
      official: false,
      publishedAt: hit.created_at ?? new Date().toISOString(),
      excerpt: "",
      feedContent: "",
      score: hit.points ?? 0,
      alsoOn: [],
    });
  }
  return out;
}

export interface CollectResult {
  candidates: Candidate[];
  sourcesOk: number;
  sourcesTotal: number;
  errors: { source: string; message: string }[];
}

export async function collectAll(sources: SourceConfig[], windowHours: number): Promise<CollectResult> {
  const settled = await Promise.allSettled(
    sources.map(async (src) => {
      const items = src.kind === "hn" ? await collectHn(src) : await collectRss(src);
      return { src, items };
    }),
  );
  const candidates: Candidate[] = [];
  const errors: CollectResult["errors"] = [];
  settled.forEach((r, i) => {
    const src = sources[i] as SourceConfig;
    if (r.status === "fulfilled") {
      // 経過時間の制限は、ソース個別の maxAgeHours があればそれを、なければ実行間隔から決めた期間を使う
      const cutoff = Date.now() - (src.maxAgeHours ?? windowHours) * 3_600_000;
      for (const c of r.value.items) {
        if (new Date(c.publishedAt).getTime() < cutoff) continue;
        candidates.push(c);
      }
    } else {
      errors.push({ source: src.name, message: String(r.reason instanceof Error ? r.reason.message : r.reason) });
    }
  });
  return { candidates, sourcesOk: sources.length - errors.length, sourcesTotal: sources.length, errors };
}
