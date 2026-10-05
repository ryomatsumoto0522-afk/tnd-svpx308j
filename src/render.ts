import fs from "node:fs";
import path from "node:path";
import { GENRES, GENRE_LABEL, type DigestDay, type DigestItem, type Genre } from "./types.ts";
import { escapeHtml as h, isHttpUrl, jstDate, jstDateTime } from "./util.ts";

const CSS = `
:root{
  --bg:#f6f7f9;--surface:#fff;--text:#1c2430;--muted:#5c6776;--line:#e1e5eb;
  --accent:#2457d6;--accent-soft:#e8eefc;--warn-bg:#fff4d6;--warn-text:#6b4e00;
  --impact-bg:#eef6ee;--impact-text:#245a2a;
  --g-ai:#7c4dff;--g-backend:#0f9d8a;--g-frontend:#e8710a;--g-infra:#1a73e8;--g-other:#6b7686;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#11151b;--surface:#1a2029;--text:#e6eaf0;--muted:#9aa5b4;--line:#2b3442;
    --accent:#7aa2ff;--accent-soft:#1f2b47;--warn-bg:#3a2f10;--warn-text:#f0d58a;
    --impact-bg:#1c2e1f;--impact-text:#a8d8ad;
    --g-ai:#b39dff;--g-backend:#4fd1bd;--g-frontend:#ffa94d;--g-infra:#7aa2ff;--g-other:#9aa5b4;
  }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);
  font:16px/1.75 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",Meiryo,sans-serif}
a{color:var(--accent)}
.wrap{max-width:760px;margin:0 auto;padding:0 16px}
header.top{padding:20px 0 4px}
h1{font-size:1.25rem;margin:0;letter-spacing:.02em}
.date{margin:2px 0 0;font-size:.95rem;color:var(--muted)}
.meta{margin:6px 0 0;font-size:.78rem;color:var(--muted)}
.notice{margin:12px 0 0;padding:8px 12px;border-radius:8px;background:var(--warn-bg);color:var(--warn-text);font-size:.85rem}
.tabs{display:none;position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);
  margin:12px -16px 0;padding:0 16px;gap:4px;overflow-x:auto;scrollbar-width:none}
.js .tabs{display:flex}
.tabs::-webkit-scrollbar{display:none}
.tab{appearance:none;border:0;background:none;color:var(--muted);font:inherit;font-size:.92rem;font-weight:600;
  padding:12px 12px;cursor:pointer;white-space:nowrap;border-bottom:3px solid transparent}
.tab[aria-selected="true"]{color:var(--accent);border-bottom-color:var(--accent)}
.tab:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;border-radius:6px}
.tab .n{font-weight:400;font-size:.8rem;margin-left:4px}
.panel{padding:8px 0 4px}
.panel[hidden]{display:none}
.panel>h2{font-size:1rem;margin:20px 0 0;color:var(--muted)}
.js .panel>h2{display:none}
.card{--gc:var(--g-other);background:var(--surface);border:1px solid var(--line);border-left:5px solid var(--gc);border-radius:12px;padding:14px 16px;margin:12px 0}
.g-ai{--gc:var(--g-ai)}.g-backend{--gc:var(--g-backend)}.g-frontend{--gc:var(--g-frontend)}.g-infra{--gc:var(--g-infra)}.g-other{--gc:var(--g-other)}
.badge{display:inline-block;margin:0 0 6px;padding:1px 9px;border-radius:999px;border:1px solid var(--gc);color:var(--gc);font-size:.74rem;font-weight:700}
.card h3{font-size:1.08rem;line-height:1.5;margin:0 0 4px}
.card h3 a{text-decoration:none;color:var(--text)}
.card h3 a:hover{color:var(--accent);text-decoration:underline}
.orig{margin:0 0 8px;font-size:.8rem;color:var(--muted);line-height:1.5}
.src{margin:0 0 8px;font-size:.78rem;color:var(--muted)}
.src a{color:var(--muted)}
.tag{display:inline-block;margin-left:6px;padding:0 6px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:.72rem}
.points{margin:8px 0 0;padding-left:1.2em}
.points li{margin:3px 0}
.points li::marker{color:var(--gc)}
.impact{margin:10px 0 0;padding:8px 12px;border-radius:8px;background:var(--impact-bg);color:var(--impact-text);font-size:.9rem;line-height:1.6}
.impact b{margin-right:6px}
.summary{margin:0}
.top3>h2{font-size:.95rem;margin:0 0 4px;color:var(--muted);letter-spacing:.04em}
.top3 .card{padding:16px 18px;box-shadow:0 1px 6px rgba(0,0,0,.06)}
.top3 .card h3{font-size:1.12rem}
.top3 .num{display:inline-block;margin-right:8px;color:var(--gc);font-weight:800}
.more{display:inline-block;margin-top:8px;font-size:.82rem}
details.gloss{margin-top:10px;border-top:1px dashed var(--line);padding-top:8px;font-size:.88rem}
details.gloss summary{cursor:pointer;color:var(--muted);font-weight:600}
details.gloss dl{margin:8px 0 0}
details.gloss dt{font-weight:700;margin-top:6px}
details.gloss dd{margin:0;color:var(--muted)}
.empty{color:var(--muted);padding:24px 0}
footer{margin:28px 0 48px;padding-top:16px;border-top:1px solid var(--line);font-size:.88rem;color:var(--muted)}
.pager{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}
.pager span{visibility:hidden}
.archive summary{cursor:pointer}
.archive ul{columns:2;padding-left:18px;margin:8px 0 0}
.fine{font-size:.76rem;margin-top:12px}
`;

const JS = `
(function(){
  var tabs=[].slice.call(document.querySelectorAll('.tab'));
  var panels=[].slice.call(document.querySelectorAll('.panel'));
  if(!tabs.length)return;
  function show(id,push){
    var ok=false;
    tabs.forEach(function(t){var on=t.dataset.tab===id;t.setAttribute('aria-selected',on);t.tabIndex=on?0:-1;if(on)ok=true;});
    if(!ok)return show(tabs[0].dataset.tab,push);
    panels.forEach(function(p){p.hidden=p.id!=='panel-'+id;});
    try{if(push)history.replaceState(null,'','#'+id);}catch(e){}
  }
  tabs.forEach(function(t,i){
    t.addEventListener('click',function(){show(t.dataset.tab,true);});
    t.addEventListener('keydown',function(e){
      var d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;
      if(!d)return;
      var n=tabs[(i+d+tabs.length)%tabs.length];n.focus();show(n.dataset.tab,true);e.preventDefault();
    });
  });
  window.addEventListener('hashchange',function(){show(location.hash.slice(1),false);});
  var start=location.hash.slice(1);
  show(start||tabs[0].dataset.tab,false);
})();
`;

export interface PageContext {
  /** 新しい順ではなく昇順の全日付 */
  dates: string[];
  /** このページから日付ディレクトリ・トップへの相対パスの接頭辞（"./" か "../"） */
  base: string;
}

function weekdayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00+09:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

/** 構造化された要約があればそれを、なければ（旧データ・オフライン）従来の要約文を出す */
function renderBody(item: DigestItem): string {
  const points = item.points ?? [];
  if (!item.headline || points.length === 0) return `<p class="summary">${h(item.summary)}</p>`;
  const impact = item.impact ? `<p class="impact"><b>影響</b>${h(item.impact)}</p>` : "";
  return `<ul class="points">${points.map((p) => `<li>${h(p)}</li>`).join("")}</ul>${impact}`;
}

function renderItem(item: DigestItem, opts: { id?: string; num?: number } = {}): string {
  const safeUrl = isHttpUrl(item.url) ? item.url : "#";
  const modeTag = item.bodyMode === "feed" ? `<span class="tag">フィード本文から要約</span>` : "";
  const structured = Boolean(item.headline && item.points?.length);
  const gloss =
    item.glossary.length > 0
      ? `<details class="gloss"><summary>用語メモ（${item.glossary.length}）</summary><dl>${item.glossary
          .map((g) => `<dt>${h(g.term)}</dt><dd>${h(g.explanation)}</dd>`)
          .join("")}</dl></details>`
      : "";
  const link = (text: string) => `<a href="${h(safeUrl)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  const num = opts.num ? `<span class="num">${opts.num}</span>` : "";
  // 構造化されていれば見出しを主役に、元タイトルは小さく添える
  const head = structured
    ? `<h3>${num}${link(h((item.headline ?? "").replace(/[。.]$/, "")))}</h3>\n<p class="orig">原題: ${h(item.title)}</p>`
    : `<h3>${num}${link(h(item.title))}</h3>`;
  return `<article class="card g-${item.genre}"${opts.id ? ` id="${opts.id}"` : ""}>
<span class="badge">${h(GENRE_LABEL[item.genre])}</span>
${head}
<p class="src">出典: ${link(h(item.source))} · ${h(jstDate(new Date(item.publishedAt)))}${modeTag}</p>
${renderBody(item)}
${gloss}
</article>`;
}

/** 「注目」タブの中身。重要度順の上位 3 件を番号つきで出す */
function topItems(items: DigestItem[]): DigestItem[] {
  return [...items].sort((x, y) => x.rank - y.rank).slice(0, 3);
}

function renderTopPanel(top: DigestItem[]): string {
  return `<section class="panel top3" id="panel-top" role="tabpanel"><h2>今日の注目 ${top.length}選</h2>${top
    .map((it, i) => renderItem(it, { num: i + 1 }))
    .join("\n")}</section>`;
}

export function renderPage(day: DigestDay, ctx: PageContext): string {
  const byGenre = new Map<Genre, DigestItem[]>();
  for (const item of day.items) {
    const list = byGenre.get(item.genre) ?? [];
    list.push(item);
    byGenre.set(item.genre, list);
  }
  const genres = GENRES.filter((g) => (byGenre.get(g)?.length ?? 0) > 0);

  const idx = ctx.dates.indexOf(day.date);
  const prev = idx > 0 ? ctx.dates[idx - 1] : undefined;
  const next = idx >= 0 && idx < ctx.dates.length - 1 ? ctx.dates[idx + 1] : undefined;

  const top = topItems(day.items);
  const topTab =
    top.length > 0
      ? `<button class="tab" role="tab" type="button" data-tab="top" aria-selected="false" aria-controls="panel-top">注目<span class="n">${top.length}</span></button>`
      : "";
  const tabs =
    topTab +
    genres
    .map(
      (g) =>
        `<button class="tab" role="tab" type="button" data-tab="${g}" aria-selected="false" aria-controls="panel-${g}">${h(GENRE_LABEL[g])}<span class="n">${byGenre.get(g)?.length ?? 0}</span></button>`,
    )
    .join("");

  const panels =
    genres.length > 0
      ? [renderTopPanel(top), ...genres
          .map(
            (g) =>
              `<section class="panel" id="panel-${g}" role="tabpanel"><h2>${h(GENRE_LABEL[g])}</h2>${(byGenre.get(g) ?? []).map((it) => renderItem(it)).join("\n")}</section>`,
          )]
          .join("\n")
      : `<p class="empty">この日は掲載できる記事がありませんでした。</p>`;

  const cost = day.offline
    ? "オフラインプレビュー（LLM 未使用）"
    : day.cost.usd === 0
      ? `LLM 費用 0円（${day.cost.provider === "gemini" ? "Gemini 無料枠" : "無料枠"}）`
      : `本日の費用の概算 約${Math.round(day.cost.jpy)}円（$${day.cost.usd.toFixed(3)}）`;
  const s = day.stats;

  const pager = `<div class="pager">${
    prev ? `<a href="${ctx.base}${prev}/">← ${h(prev)}</a>` : "<span>.</span>"
  }${next ? `<a href="${ctx.base}${next}/">${h(next)} →</a>` : "<span>.</span>"}</div>`;
  const archive = `<details class="archive"><summary>過去の日付（${ctx.dates.length}）</summary><ul>${[...ctx.dates]
    .reverse()
    .map((d) => `<li><a href="${ctx.base}${d}/">${h(d)}</a></li>`)
    .join("")}</ul></details>`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="light dark">
<title>テックニュース ${h(day.date)}</title>
<script>document.documentElement.classList.add('js')</script>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="top">
<h1>毎朝のテックニュース</h1>
<p class="date">${h(weekdayLabel(day.date))}</p>
<p class="meta">更新 ${h(jstDateTime(new Date(day.generatedAt)))} · 取得ソース ${s.sourcesOk}/${s.sourcesTotal} · 選定 ${day.items.length}件（候補 ${s.shortlisted}件） · ${h(cost)}</p>
${day.offline ? `<p class="notice">オフラインプレビューです。要約は記事の冒頭の抜粋で、LLM による要約ではありません。</p>` : ""}
<nav class="tabs" role="tablist" aria-label="ジャンル">${tabs}</nav>
</header>
<main>
${panels}
</main>
<footer>
${pager}
${archive}
<p class="fine">要約は LLM が生成しています。正確な内容は各記事の出典元で確認してください。</p>
</footer>
</div>
<script>${JS}</script>
</body>
</html>
`;
}

/** 全日付のページと、最新日のトップページ、検索避けのファイルを書き出す */
export function writeSite(outDir: string, days: DigestDay[]): void {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const dates = sorted.map((d) => d.date);
  fs.mkdirSync(outDir, { recursive: true });

  for (const day of sorted) {
    const dir = path.join(outDir, day.date);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), renderPage(day, { dates, base: "../" }));
  }
  const latest = sorted.at(-1);
  if (latest) {
    fs.writeFileSync(path.join(outDir, "index.html"), renderPage(latest, { dates, base: "./" }));
  }
  fs.writeFileSync(path.join(outDir, "robots.txt"), "User-agent: *\nDisallow: /\n");
  fs.writeFileSync(path.join(outDir, ".nojekyll"), "");
}
