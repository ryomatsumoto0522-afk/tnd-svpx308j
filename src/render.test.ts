import assert from "node:assert/strict";
import { test } from "node:test";
import { renderPage } from "./render.ts";
import type { DigestDay, DigestItem } from "./types.ts";

const base: DigestItem = {
  rank: 1,
  url: "https://example.com/a",
  title: "Original Title",
  source: "Example",
  genre: "ai",
  publishedAt: "2026-10-01T00:00:00Z",
  summary: "従来形式の要約文です。".repeat(5),
  glossary: [],
  bodyMode: "full",
};

function day(items: DigestItem[]): DigestDay {
  return {
    date: "2026-10-02",
    generatedAt: "2026-10-01T20:30:00Z",
    items,
    stats: { sourcesOk: 1, sourcesTotal: 1, candidates: 1, shortlisted: 1, bodyFailures: 0, summaryFailures: 0 },
    cost: { usd: 0, jpy: 0, inputTokens: 0, outputTokens: 0 },
    offline: false,
  };
}
const ctx = { dates: ["2026-10-02"], base: "./" };

test("構造化された要約は、見出し・ポイント・影響として描画し、原題を添える", () => {
  const html = renderPage(
    day([{ ...base, headline: "新モデルが発表されました", points: ["ポイント1です", "ポイント2です"], impact: "開発者は料金を確認" }]),
    ctx,
  );
  assert.match(html, /<h3>[^]*新モデルが発表されました/);
  assert.match(html, /<li>ポイント1です<\/li>/);
  assert.match(html, /class="impact"><b>影響<\/b>開発者は料金を確認/);
  assert.match(html, /原題: Original Title/);
});

test("見出しの末尾の句点は表示しない", () => {
  const html = renderPage(day([{ ...base, headline: "発表されました。", points: ["a点", "b点"] }]), ctx);
  assert.match(html, />発表されました<\/a><\/h3>/);
});

test("影響が空なら影響ブロックを出さない", () => {
  const html = renderPage(day([{ ...base, headline: "見出し", points: ["a点", "b点"] }]), ctx);
  assert.doesNotMatch(html, /class="impact"/);
});

test("旧形式（summary のみ）の日はこれまでどおりの要約文で表示される", () => {
  const html = renderPage(day([base]), ctx);
  assert.match(html, /<p class="summary">従来形式/);
  assert.match(html, /<h3>[^]*Original Title/);
  assert.doesNotMatch(html, /原題:/);
});

test("今日の注目は先頭の別タブで、重要度順の上位 3 件。HTML をエスケープする", () => {
  const items = [4, 2, 1, 3].map((rank) => ({ ...base, rank, url: `https://example.com/${rank}`, title: `T${rank}<b>` }));
  const html = renderPage(day(items), ctx);
  assert.match(html, /data-tab="top"[^>]*>注目<span class="n">3<\/span>/);
  assert.ok(html.indexOf('data-tab="top"') < html.indexOf('data-tab="ai"'));
  const start = html.indexOf('id="panel-top"');
  const top = html.slice(start, html.indexOf('id="panel-ai"'));
  assert.equal((top.match(/<article/g) ?? []).length, 3);
  assert.ok(top.indexOf("T1&lt;b&gt;") < top.indexOf("T2&lt;b&gt;") && top.indexOf("T2&lt;b&gt;") < top.indexOf("T3&lt;b&gt;"));
  assert.doesNotMatch(top, /T4/);
  assert.doesNotMatch(html, /T1<b>/);
});
