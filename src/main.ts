import { getBody, type BodyResult } from "./body.ts";
import { collectAll } from "./collect.ts";
import { PIPELINE, SOURCES } from "./config.ts";
import { CostTracker, selectPicks, summarize, type Pick } from "./llm.ts";
import { createProvider } from "./providers.ts";
import { guessGenre } from "./offline.ts";
import { writeSite } from "./render.ts";
import { mergeAndFilter, shortlist } from "./shortlist.ts";
import { loadAllDays, loadState, pruneSeen, saveDay, saveState } from "./state.ts";
import { GENRES, type DigestDay, type DigestItem, type Genre } from "./types.ts";
import { cleanUrl, jstDate, mapLimit, normalizeUrl, truncate } from "./util.ts";

const args = new Set(process.argv.slice(2));
const offline = args.has("--offline");
const force = args.has("--force") || process.env.FORCE === "1";
const rerenderOnly = args.has("--rerender");

// オフラインのプレビューは本番のデータ（掲載済み URL など）を汚さないよう別の場所に書く
const dataDir = process.env.DATA_DIR ?? (offline ? ".preview/data" : "data");
const outDir = process.env.OUTPUT_DIR ?? (offline ? ".preview/docs" : "docs");

const log = (msg: string) => console.log(msg);

interface Entry {
  pick: Pick;
  order: number;
  body: BodyResult;
}

async function main(): Promise<void> {
  if (rerenderOnly) {
    writeSite(outDir, loadAllDays(dataDir));
    log(`再描画しました: ${outDir}`);
    return;
  }

  const now = new Date();
  const today = jstDate(now);
  const state = loadState(dataDir);
  const existing = loadAllDays(dataDir).find((d) => d.date === today);
  if (existing && !force) {
    log(`${today} は生成済みなのでスキップします（作り直すには --force）`);
    return;
  }
  if (force) {
    for (const [url, date] of Object.entries(state.seen)) if (date === today) delete state.seen[url];
  }

  const provider = offline ? null : createProvider();
  const cost = new CostTracker(provider?.name ?? "offline");

  // 1. 収集：前回実行からの期間（24〜72 時間）を対象にする
  const elapsedHours = state.lastRun ? (now.getTime() - new Date(state.lastRun).getTime()) / 3_600_000 : 0;
  const windowHours = Math.min(Math.max(elapsedHours + 1, PIPELINE.minWindowHours), PIPELINE.maxWindowHours);
  const collected = await collectAll(SOURCES, windowHours);
  for (const e of collected.errors) console.warn(`取得失敗: ${e.source}: ${e.message}`);
  if (collected.sourcesOk === 0) throw new Error("すべてのソースの取得に失敗しました");
  log(`収集: ${collected.candidates.length}件 (ソース ${collected.sourcesOk}/${collected.sourcesTotal}, 対象期間 ${Math.round(windowHours)}時間)`);

  // 2. 機械的な絞り込み：重複と掲載済みを除き、約 60 件に絞る
  const merged = mergeAndFilter(collected.candidates, state.seen);
  const short = shortlist(merged, SOURCES, PIPELINE.shortlistSize);
  log(`絞り込み: 重複・掲載済み除去後 ${merged.length}件 → ${short.length}件`);
  if (short.length === 0) throw new Error("候補が 0 件でした");

  // 3. LLM による選定（重要な順、ジャンル付き）
  const picks: Pick[] = provider
    ? await selectPicks(provider, cost, short)
    : short.slice(0, PIPELINE.selectionSize).map((candidate) => ({ candidate, genre: guessGenre(candidate) }));
  log(`選定: ${picks.length}件（控えを含む）`);

  // 4. 本文取得：失敗した記事は後続の次点に自然に置き換わる
  const bodies = await mapLimit(picks, 8, (p) => getBody(p.candidate));
  const pool: Entry[] = [];
  picks.forEach((pick, order) => {
    const body = bodies[order];
    if (body) pool.push({ pick, order, body });
  });
  const bodyFailures = picks.length - pool.length;
  log(`本文取得: ${pool.length}/${picks.length}件成功`);

  // 5. 要約：ジャンル上限と合計件数を守りながら、失敗した分は次点から補う
  const counts = Object.fromEntries(GENRES.map((g) => [g, 0])) as Record<Genre, number>;
  const accepted: DigestItem[] = [];
  let summaryFailures = 0;
  let cursor = 0;
  while (accepted.length < PIPELINE.totalItems) {
    const need = PIPELINE.totalItems - accepted.length;
    const reserved = { ...counts };
    const wave: Entry[] = [];
    while (cursor < pool.length && wave.length < need) {
      const e = pool[cursor++] as Entry;
      if (reserved[e.pick.genre] >= PIPELINE.genreCaps[e.pick.genre]) continue;
      reserved[e.pick.genre]++;
      wave.push(e);
    }
    if (wave.length === 0) break;

    const results = await mapLimit(wave, provider?.concurrency ?? 4, async (e) => {
      const c = e.pick.candidate;
      if (!provider) {
        const excerpt = truncate(c.excerpt || e.body.text, 200);
        return { e, s: { summary: `${excerpt}…`, glossary: [] } };
      }
      try {
        return { e, s: await summarize(provider, cost, c, e.body.text) };
      } catch (err) {
        if (provider.isFatal(err)) throw err;
        summaryFailures++;
        console.warn(`要約失敗（次点に差し替え）: ${c.title}: ${err instanceof Error ? err.message : err}`);
        return { e, s: null };
      }
    });
    for (const { e, s } of results) {
      if (!s) continue;
      counts[e.pick.genre]++;
      const c = e.pick.candidate;
      accepted.push({
        rank: e.order + 1,
        url: cleanUrl(c.url),
        title: c.title,
        source: c.source,
        genre: e.pick.genre,
        publishedAt: c.publishedAt,
        summary: s.summary,
        glossary: s.glossary,
        bodyMode: e.body.mode,
      });
    }
  }
  if (accepted.length === 0) throw new Error("要約できた記事が 0 件でした");
  accepted.sort((a, b) => a.rank - b.rank);

  // 6. 保存と書き出し
  const day: DigestDay = {
    date: today,
    generatedAt: now.toISOString(),
    items: accepted,
    stats: {
      sourcesOk: collected.sourcesOk,
      sourcesTotal: collected.sourcesTotal,
      candidates: merged.length,
      shortlisted: short.length,
      bodyFailures,
      summaryFailures,
    },
    cost: cost.snapshot(),
    offline,
  };
  saveDay(dataDir, day);
  for (const item of accepted) state.seen[normalizeUrl(item.url)] = today;
  state.seen = pruneSeen(state.seen, today, PIPELINE.seenRetentionDays);
  state.lastRun = now.toISOString();
  saveState(dataDir, state);
  writeSite(outDir, loadAllDays(dataDir));

  const byGenre = GENRES.map((g) => `${g}:${counts[g]}`).join(" ");
  log(`完了: ${accepted.length}件 (${byGenre}) 費用の概算 約${Math.round(day.cost.jpy)}円 → ${outDir}`);
}

// keep-alive の接続が残って終了が遅れるので、完了したら明示的に終了する
try {
  await main();
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
