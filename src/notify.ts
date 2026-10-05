import { deliveryTime, sendMail } from "./email.ts";
import { loadAllDays } from "./state.ts";
import { GENRES, GENRE_LABEL, type DigestItem } from "./types.ts";
import { escapeHtml, isHttpUrl } from "./util.ts";

const kind = process.argv[2];
const dataDir = process.env.DATA_DIR ?? "data";
const siteUrl = process.env.SITE_URL ?? "";

function canSend(): boolean {
  if (process.env.RESEND_API_KEY && process.env.MAIL_TO) return true;
  // CI では通知が届かないまま成功扱いにしない
  if (process.env.CI) throw new Error("RESEND_API_KEY / MAIL_TO が未設定のため通知できません");
  console.warn("RESEND_API_KEY / MAIL_TO が未設定なので通知をスキップします");
  return false;
}

const GENRE_COLOR: Record<string, string> = {
  ai: "#7c4dff",
  backend: "#0f9d8a",
  frontend: "#e8710a",
  infra: "#1a73e8",
  other: "#6b7686",
};

const headlineOf = (it: DigestItem) => (it.headline ?? it.title).replace(/[。.]$/, "");
const pointsOf = (it: DigestItem) => (it.points?.length ? it.points : [it.summary]);
const safeHref = (url: string) => (isHttpUrl(url) ? escapeHtml(url) : "#");

/** 注目記事 1 件分のメール用カード（インライン CSS。メールクライアントでも崩れにくいように table は使わない） */
function topCardHtml(it: DigestItem, n: number): string {
  const color = GENRE_COLOR[it.genre] ?? GENRE_COLOR.other;
  const points = pointsOf(it)
    .map((p) => `<li style="margin:3px 0">${escapeHtml(p)}</li>`)
    .join("");
  const impact = it.impact
    ? `<p style="margin:10px 0 0;padding:8px 12px;background:#eef6ee;color:#245a2a;border-radius:6px;font-size:14px"><b>影響</b> ${escapeHtml(it.impact)}</p>`
    : "";
  return `<div style="margin:14px 0;padding:14px 16px;border:1px solid #e1e5eb;border-left:5px solid ${color};border-radius:10px">
<div style="font-size:12px;font-weight:bold;color:${color}">${escapeHtml(GENRE_LABEL[it.genre])}</div>
<div style="margin:4px 0 6px;font-size:17px;font-weight:bold;line-height:1.5"><span style="color:${color}">${n}</span> <a href="${safeHref(it.url)}" style="color:#1c2430;text-decoration:none">${escapeHtml(headlineOf(it))}</a></div>
<ul style="margin:6px 0 0;padding-left:1.2em;font-size:15px;line-height:1.7">${points}</ul>${impact}
<div style="margin-top:8px;font-size:12px;color:#5c6776">出典: ${escapeHtml(it.source)}</div>
</div>`;
}

async function success(): Promise<void> {
  if (!canSend()) return;
  const day = loadAllDays(dataDir).at(-1);
  if (!day) throw new Error("通知する日のデータがありません");
  const sorted = [...day.items].sort((a, b) => a.rank - b.rank);
  // 上位 3 件（選定時の重要度順）を詳しく、残りは見出しだけ
  const top = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  const text = [
    `${day.date} のテックニュース（${day.items.length}件）`,
    siteUrl ? `全部読む: ${siteUrl}` : "",
    "",
    "■ 今日の注目",
    ...top.flatMap((t, i) => [
      `${i + 1}. [${GENRE_LABEL[t.genre]}] ${headlineOf(t)}`,
      ...pointsOf(t).map((p) => `   ・${p}`),
      ...(t.impact ? [`   影響: ${t.impact}`] : []),
      `   ${t.url}`,
      "",
    ]),
    ...(rest.length ? ["■ ほかのニュース", ...rest.map((t) => `・[${GENRE_LABEL[t.genre]}] ${headlineOf(t)}`)] : []),
  ].join("\n");

  const restHtml = GENRES.map((g) => {
    const list = rest.filter((t) => t.genre === g);
    if (list.length === 0) return "";
    const color = GENRE_COLOR[g] ?? GENRE_COLOR.other;
    return `<div style="margin:12px 0 0;font-size:13px;font-weight:bold;color:${color}">${escapeHtml(GENRE_LABEL[g])}</div><ul style="margin:4px 0 0;padding-left:1.2em;font-size:14px;line-height:1.7">${list
      .map((t) => `<li><a href="${safeHref(t.url)}" style="color:#1c2430">${escapeHtml(headlineOf(t))}</a></li>`)
      .join("")}</ul>`;
  }).join("");

  const html = `<div style="max-width:640px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;color:#1c2430">
<h1 style="font-size:19px;margin:0">毎朝のテックニュース</h1>
<p style="margin:2px 0 0;color:#5c6776;font-size:14px">${escapeHtml(day.date)} · ${day.items.length}件</p>
<p style="margin:14px 0"><a href="${escapeHtml(siteUrl)}" style="display:inline-block;padding:9px 18px;background:#2457d6;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">全部読む（ページを開く）</a></p>
<h2 style="font-size:15px;margin:18px 0 0;color:#5c6776">今日の注目 ${top.length}選</h2>
${top.map((t, i) => topCardHtml(t, i + 1)).join("\n")}
${rest.length ? `<h2 style="font-size:15px;margin:22px 0 0;color:#5c6776">ほかのニュース</h2>${restHtml}` : ""}
<p style="margin:24px 0 0;font-size:12px;color:#8a94a3">要約は LLM が生成しています。正確な内容は各記事の出典元で確認してください。</p>
</div>`;

  // 朝 7 時（JST）に届くよう予約する。7 時を過ぎていればすぐ送る。MAIL_HOUR で変えられる
  const scheduledAt = deliveryTime(new Date(), Number(process.env.MAIL_HOUR) || 7);
  const id = await sendMail({ subject: `【テックニュース】${day.date} のまとめができました`, text, html, scheduledAt });
  console.log(
    `${scheduledAt ? `完了通知を予約しました（${scheduledAt.toISOString()}）` : "完了通知を送信しました"} Resend id=${id}`,
  );
}

async function failure(): Promise<void> {
  if (!canSend()) return;
  const runUrl = process.env.RUN_URL ?? "";
  await sendMail({
    subject: "【テックニュース】今朝の生成に失敗しました",
    text: `毎朝のテックニュースの生成に失敗しました。\nログ: ${runUrl}\n\n前回成功した日のページはそのまま残っています。`,
  });
  console.log("失敗通知を送信しました");
}

if (kind === "success") await success();
else if (kind === "failure") await failure();
else throw new Error("使い方: tsx src/notify.ts success|failure");
process.exit(0);
