import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import { PIPELINE } from "./config.ts";
import type { Candidate } from "./types.ts";
import { truncate, USER_AGENT } from "./util.ts";

export interface BodyResult {
  text: string;
  mode: "full" | "feed";
}

async function fetchArticleText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/html/i.test(type)) throw new Error(`HTML ではない (${type || "不明"})`);
  // 本文抽出に不要な style / script は、解析時間と警告のもとなので先に除く
  const html = (await res.text()).replace(/<(style|script|noscript)\b[\s\S]*?<\/\1>/gi, "");
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  try {
    const article = new Readability(dom.window.document).parse();
    return (article?.textContent ?? "").replace(/\s+/g, " ").trim();
  } finally {
    dom.window.close();
  }
}

/**
 * 記事本文を取得する。取得できない（ペイウォール、ボット対策、本文が短すぎる）場合は、
 * フィードに全文が載っていればそれを使い、なければ失敗として null を返す。
 */
export async function getBody(c: Candidate): Promise<BodyResult | null> {
  try {
    const text = await fetchArticleText(c.url);
    if (text.length >= PIPELINE.minBodyChars) {
      return { text: truncate(text, PIPELINE.bodyChars), mode: "full" };
    }
  } catch {
    // フィードの本文にフォールバックする
  }
  if (c.feedContent.length >= PIPELINE.minBodyChars) {
    return { text: truncate(c.feedContent, PIPELINE.bodyChars), mode: "feed" };
  }
  return null;
}
