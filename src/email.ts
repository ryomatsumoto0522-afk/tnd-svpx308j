/** Resend の API でメールを 1 通送る。宛先は 1 つ（自分宛て） */
export async function sendMail(opts: { subject: string; text: string; html?: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.MAIL_TO;
  if (!apiKey || !to) throw new Error("RESEND_API_KEY または MAIL_TO が設定されていません");
  const from = process.env.MAIL_FROM ?? "Tech News Digest <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: opts.subject, text: opts.text, html: opts.html }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
