type AlertJob = { title: string; company_name: string; location: string | null; id: string };

export async function sendDiscoveryEmail(args: { to: string; jobs: AlertJob[]; deliveryKey: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DISCOVERY_EMAIL_FROM;
  // Never acknowledge a notification as emailed when delivery is impossible.
  // The digest runner records this error and leaves the notification pending
  // for a retry once the deployment is configured correctly.
  if (!apiKey || !from) throw new Error("Discovery email is not configured");

  const appUrl = publicEmailAppUrl();
  const rows = args.jobs.map(job => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #e5e7eb">
      <a href="${appUrl}/discover/${job.id}" style="font-weight:700;color:#111827;text-decoration:none">${escapeHtml(job.title)}</a><br/>
      <span style="color:#6b7280">${escapeHtml(job.company_name)}${job.location ? ` · ${escapeHtml(job.location)}` : ""}</span>
    </td></tr>`).join("");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "AppliHero/1.0",
      "Idempotency-Key": `discovery-${args.deliveryKey}`.slice(0, 250),
    },
    body: JSON.stringify({
      from, to: [args.to],
      subject: `${args.jobs.length} new AppliHero job match${args.jobs.length === 1 ? "" : "es"}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#111827"><h1 style="font-size:22px">New jobs worth reviewing</h1><p style="color:#4b5563">AppliHero found these new roles at companies you follow.</p><table style="width:100%;border-collapse:collapse">${rows}</table><p style="margin-top:24px"><a href="${appUrl}/discover" style="background:#4f46e5;color:white;padding:11px 16px;border-radius:8px;text-decoration:none;font-weight:700">Open Discover</a></p></div>`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  return { sent: true };
}

function publicEmailAppUrl() {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  try {
    const hostname = new URL(configured).hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") return configured;
  } catch {
    // Fall through to the deployment URL when the configured value is absent or invalid.
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return productionHost ? `https://${productionHost}` : "https://www.applihero.com";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] || character));
}
