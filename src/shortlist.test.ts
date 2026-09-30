import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceConfig } from "./config.ts";
import { keywordHits, mergeAndFilter, shortlist } from "./shortlist.ts";
import type { Candidate } from "./types.ts";
import { normalizeUrl } from "./util.ts";

const base = (o: Partial<Candidate>): Candidate => ({
  url: "https://example.com/a",
  title: "t",
  source: "S",
  genreHint: null,
  official: false,
  publishedAt: "2026-10-01T00:00:00Z",
  excerpt: "",
  feedContent: "",
  score: null,
  alsoOn: [],
  ...o,
});

test("normalizeUrl は計測パラメータとハッシュを落とす", () => {
  assert.equal(normalizeUrl("https://Example.com/a/?utm_source=x&id=1#top"), "https://example.com/a/?id=1");
  assert.equal(normalizeUrl("https://example.com/a/"), "https://example.com/a");
});

test("掲載済みの URL は除かれる", () => {
  const out = mergeAndFilter([base({ url: "https://example.com/a?utm_medium=z" })], { "https://example.com/a": "2026-09-30" });
  assert.equal(out.length, 0);
});

test("同じ記事は 1 件にまとまり、公式ソースと他ソース名が残る", () => {
  const out = mergeAndFilter(
    [base({ source: "HN", score: 300 }), base({ source: "Official", official: true, feedContent: "本文" })],
    {},
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]?.source, "Official");
  assert.deepEqual(out[0]?.alsoOn, ["HN"]);
  assert.equal(out[0]?.score, 300);
});

test("URL が違ってもタイトルが同じなら 1 件にまとまる", () => {
  const out = mergeAndFilter(
    [
      base({ url: "https://deepmind.google/a", source: "DeepMind", official: true, title: "Gemini 4 Argon: our next era" }),
      base({ url: "https://b.hatena.ne.jp/entry/1", source: "Hatena", score: 500, title: "Gemini 4 Argon: our next era" }),
    ],
    {},
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]?.source, "DeepMind");
  assert.deepEqual(out[0]?.alsoOn, ["Hatena"]);
});

test("ソース上限と関心キーワードが効き、公式が先に並ぶ", () => {
  const sources: SourceConfig[] = [
    { name: "Off", kind: "rss", url: "", genre: "ai", official: true, maxPerRun: 1 },
    { name: "Com", kind: "rss", url: "", genre: null, maxPerRun: 2 },
  ];
  const cands = [
    base({ url: "https://x/1", source: "Com", title: "普通の記事" }),
    base({ url: "https://x/2", source: "Com", title: "Claude の新機能" }),
    base({ url: "https://x/3", source: "Com", title: "別の記事" }),
    base({ url: "https://x/4", source: "Off", official: true, title: "公式発表" }),
    base({ url: "https://x/5", source: "Off", official: true, title: "公式の古い発表", publishedAt: "2026-09-29T00:00:00Z" }),
  ];
  const out = shortlist(cands, sources, 10);
  assert.equal(out.length, 3); // Off は 1 件、Com は 2 件まで
  assert.equal(out[0]?.url, "https://x/4");
  assert.equal(out[1]?.url, "https://x/2");
});

test("keywordHits は大文字小文字を区別しない", () => {
  assert.equal(keywordHits({ title: "AWS Lambda と Spring", excerpt: "" }) >= 3, true);
});
