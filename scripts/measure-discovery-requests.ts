import { config } from "dotenv";
import { performance } from "node:perf_hooks";

config({ path: ".env.local" });

/**
 * Times the HTTP requests the Discover page issues, end to end, against a
 * running app server. A short-lived session is minted for the given account
 * with the service role's admin API; the token stays in memory and is never
 * printed. Read-only against the feed.
 *
 * Usage: npx tsx scripts/measure-discovery-requests.ts --email you@example.com [--base http://localhost:3000] [--repeat 2]
 */
async function main() {
  const arg = (name: string, fallback = "") => { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] : fallback; };
  const email = arg("email", "");
  const base = arg("base", "http://localhost:3000").replace(/\/$/, "");
  const repeat = Math.max(1, Number(arg("repeat", "1")));
  if (!email) throw new Error("--email is required");
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError) throw linkError;
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: otpError } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (otpError) throw otpError;
  const token = session.session?.access_token;
  if (!token) throw new Error("No session token");

  const paths = [
    "/api/discover?scope=matches&limit=50",
    "/api/discover?scope=matches&limit=100",
    "/api/discover?scope=all&limit=50",
    "/api/discover?scope=all&limit=100",
    "/api/discover?scope=all&company=Berlin&limit=50",
    "/api/discover?scope=all&query=engineer&limit=50",
    "/api/discover/sources",
    "/api/discover/notifications",
    "/api/discover/preferences",
  ];
  console.log(`Base: ${base}\n`);
  console.log(["ms".padStart(7), "status", "bytes".padStart(9), "jobs".padStart(5), "total".padStart(6), " path"].join(" "));
  for (let round = 0; round < repeat; round += 1) {
    for (const path of paths) {
      const started = performance.now();
      const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const text = await response.text();
      const ms = performance.now() - started;
      let jobs = "", total = "";
      try { const json = JSON.parse(text); if (Array.isArray(json.jobs)) { jobs = String(json.jobs.length); total = String(json.totalResults ?? ""); } if (Array.isArray(json.sources)) jobs = `${json.sources.length}s`; } catch {}
      const timing = response.headers.get("server-timing");
      console.log([ms.toFixed(0).padStart(7), String(response.status).padStart(6), String(Buffer.byteLength(text)).padStart(9), jobs.padStart(5), total.padStart(6), " " + path + (timing ? `\n${" ".repeat(38)}server-timing: ${timing}` : "")].join(" "));
    }
    if (repeat > 1) console.log(`-- round ${round + 1} done`);
  }
  await anon.auth.signOut().catch(() => {});
}

main().catch(error => { console.error(error); process.exit(1); });
