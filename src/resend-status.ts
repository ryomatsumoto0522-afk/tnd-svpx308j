import { clean } from "./email.ts";

/** 直近に Resend から送ったメールの配信状況を表示する（届かないときの調査用。宛先や本文は出さない） */
const apiKey = clean(process.env.RESEND_API_KEY);
if (!apiKey) throw new Error("RESEND_API_KEY が設定されていません");

const res = await fetch("https://api.resend.com/emails?limit=20", {
  headers: { Authorization: `Bearer ${apiKey}` },
  signal: AbortSignal.timeout(20_000),
});
if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);

const body = (await res.json()) as { data?: Record<string, unknown>[] };
for (const m of body.data ?? []) {
  console.log(
    [m.created_at, `event=${m.last_event}`, m.scheduled_at ? `scheduled_at=${m.scheduled_at}` : "", `subject=${m.subject}`, `id=${m.id}`]
      .filter(Boolean)
      .join(" | "),
  );
}
if (!body.data?.length) console.log("送信履歴がありません");
process.exit(0);
