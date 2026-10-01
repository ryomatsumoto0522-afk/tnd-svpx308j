const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/** Secrets を貼り付けたときに混ざりがちな前後の空白・改行・引用符を除く */
export function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

/** Resend の API でメールを 1 通送る。宛先は 1 つ（自分宛て） */
export async function sendMail(opts: { subject: string; text: string; html?: string }): Promise<void> {
  const apiKey = clean(process.env.RESEND_API_KEY);
  const to = clean(process.env.MAIL_TO);
  if (!apiKey || !to) throw new Error("RESEND_API_KEY または MAIL_TO が設定されていません");
  if (!EMAIL.test(to)) {
    // 値そのものは出さない（Secrets の中身をログに残さない）
    throw new Error(`MAIL_TO がメールアドレスの形式ではありません（${to.length}文字）。余計な空白や引用符を入れず、アドレスだけを登録してください`);
  }
  const from = process.env.MAIL_FROM ?? "Tech News Digest <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: opts.subject, text: opts.text, html: opts.html }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
