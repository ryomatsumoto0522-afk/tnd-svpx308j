import { sendMail } from "./email.ts";
import { loadAllDays } from "./state.ts";
import { escapeHtml } from "./util.ts";

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

async function success(): Promise<void> {
  if (!canSend()) return;
  const day = loadAllDays(dataDir).at(-1);
  if (!day) throw new Error("通知する日のデータがありません");
  // 上位 3 件（選定時の重要度順）
  const top = [...day.items].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const text = [
    `${day.date} のテックニュース（${day.items.length}件）ができました。`,
    siteUrl,
    "",
    "今日の注目:",
    ...top.map((t, i) => `${i + 1}. ${t.title}（${t.source}）`),
  ].join("\n");
  const html = `<p>${escapeHtml(day.date)} のテックニュース（${day.items.length}件）ができました。</p>
<p><a href="${escapeHtml(siteUrl)}">ページを開く</a></p>
<p>今日の注目:</p><ol>${top.map((t) => `<li>${escapeHtml(t.title)}（${escapeHtml(t.source)}）</li>`).join("")}</ol>`;
  await sendMail({ subject: `【テックニュース】${day.date} のまとめができました`, text, html });
  console.log("完了通知を送信しました");
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
