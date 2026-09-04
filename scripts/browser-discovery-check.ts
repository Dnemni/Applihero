import { config } from "dotenv";
import { performance } from "node:perf_hooks";

config({ path: ".env.local" });

/**
 * Drives the Discover page in headless Chrome as a signed-in user and checks
 * the behaviors that regressed in September 2026: every match is reachable
 * through "Show more", All roles pages the shared catalog without scoring,
 * the saved US preference excludes foreign roles, and no page load issues
 * write requests. A short-lived session is minted through the service role's
 * admin API and injected into the browser; the token is never printed.
 *
 * Usage: npx tsx scripts/browser-discovery-check.ts --email you@example.com [--base http://localhost:3000] [--shots /tmp/discover]
 * Requires Playwright (devDependency) and Google Chrome or `npx playwright install chromium`.
 */
type Check = { name: string; ok: boolean; detail: string };

async function main() {
  const arg = (name: string, fallback = "") => { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] : fallback; };
  const email = arg("email");
  const base = arg("base", "http://localhost:3000").replace(/\/$/, "");
  const shots = arg("shots", "");
  if (!email) throw new Error("--email is required");
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError) throw linkError;
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: otpError } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (otpError || !verified.session) throw otpError || new Error("No session");
  const session = verified.session;
  const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.addInitScript(([key, value]) => { window.localStorage.setItem(key, value); }, [storageKey, JSON.stringify(session)] as [string, string]);
  const requests: Array<{ method: string; url: string; status: number; ms: number }> = [];
  const started = new Map<string, number>();
  page.on("request", request => { if (request.url().includes("/api/")) started.set(request.url() + request.method(), performance.now()); });
  page.on("response", response => {
    const request = response.request();
    if (!request.url().includes("/api/")) return;
    const begin = started.get(request.url() + request.method()) || performance.now();
    requests.push({ method: request.method(), url: request.url().replace(base, ""), status: response.status(), ms: performance.now() - begin });
  });
  const checks: Check[] = [];
  const record = (name: string, ok: boolean, detail: string) => { checks.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`); };
  const cards = () => page.locator("#discovery-results article");
  const shot = async (name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false }); };

  const navStart = performance.now();
  await page.goto(`${base}/discover`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#discovery-results article, #discovery-results p", { timeout: 60_000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Loading jobs…"), null, { timeout: 60_000 });
  const firstPaint = performance.now() - navStart;
  const initialCount = await cards().count();
  const headerText = await page.locator("#discover-overview p.text-sm.text-gray-600").innerText();
  record("matches first page renders", initialCount > 0, `${initialCount} cards after ${firstPaint.toFixed(0)} ms; header: ${headerText.trim()}`);
  await shot("01-matches");

  const matchTotal = Number((headerText.match(/([\d,]+) open/)?.[1] || "0").replace(/,/g, ""));
  let loaded = initialCount;
  let clicks = 0;
  while (await page.getByRole("button", { name: /^Show \d+ more/ }).count() && clicks < 10) {
    await page.getByRole("button", { name: /^Show \d+ more/ }).click();
    await page.waitForFunction((previous) => document.querySelectorAll("#discovery-results article").length > previous, loaded, { timeout: 30_000 });
    loaded = await cards().count();
    clicks += 1;
  }
  record("every match reachable through Show more", loaded === matchTotal && matchTotal > 50, `${loaded} cards loaded of ${matchTotal} after ${clicks} clicks`);
  const matchLocations = await cards().locator("span:has(> svg.lucide-map-pin), span.truncate").allInnerTexts().catch(() => [] as string[]);
  const bodyText = await page.locator("#discovery-results").innerText();
  record("US preference excludes Berlin/Germany/India in Matches", !/berlin|germany|bangalore|hyderabad/i.test(bodyText), `${matchLocations.length} location labels scanned`);
  record("matches never show 'Not scored'", !/Not scored/.test(bodyText), "match cards carry stored scores");
  await shot("02-matches-all-loaded");

  await page.getByRole("button", { name: "All roles", exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Not scored") || document.body.innerText.includes("No roles match"), null, { timeout: 60_000 });
  const allFirst = await cards().count();
  const allHeader = await page.locator("#discover-overview p.text-sm.text-gray-600").innerText();
  record("all roles renders a full page", allFirst >= 50, `${allFirst} cards; header: ${allHeader.trim()}`);
  const allText = await page.locator("#discovery-results").innerText();
  record("all roles cards are unscored, not conflicts", /Not scored/.test(allText) && !/\/100/.test(allText), "no /100 scores in catalog view");
  record("all roles respects US preference", !/berlin|germany|bangalore|hyderabad/i.test(allText), "no foreign on-site roles in first page");
  await page.getByRole("button", { name: /^Show \d+ more/ }).click();
  await page.waitForFunction((previous) => document.querySelectorAll("#discovery-results article").length > previous, allFirst, { timeout: 30_000 });
  record("all roles pages", (await cards().count()) > allFirst, `${await cards().count()} cards after one more page`);
  await shot("03-all-roles");

  const unfollowed = arg("company", "");
  if (unfollowed) {
    await page.getByRole("button", { name: /more filters|filters/i }).first().click().catch(() => {});
    await page.locator("select").filter({ has: page.locator("option", { hasText: "All companies" }) }).selectOption({ label: unfollowed }).catch(() => {});
    await page.getByRole("button", { name: "Apply filters" }).click().catch(() => {});
    await page.waitForTimeout(1_500);
    const companyText = await page.locator("#discovery-results").innerText();
    record(`unfollowed company search (${unfollowed})`, companyText.includes(unfollowed), `${await cards().count()} cards`);
    await shot("04-company-filter");
  }

  const writes = requests.filter(item => item.method !== "GET");
  record("page load issues no write requests", writes.length === 0, writes.length ? writes.map(item => `${item.method} ${item.url}`).join(", ") : "only GET requests observed");
  const feedRequests = requests.filter(item => item.url.startsWith("/api/discover?"));
  console.log("\nAPI requests observed:");
  for (const item of requests) console.log(`  ${item.status} ${item.ms.toFixed(0).padStart(6)} ms ${item.method} ${item.url}`);
  const failed = requests.filter(item => item.status >= 400);
  record("no failed API requests", failed.length === 0, failed.length ? failed.map(item => `${item.status} ${item.url}`).join(", ") : `${feedRequests.length} feed requests, all 2xx`);

  await browser.close();
  const failures = checks.filter(check => !check.ok);
  console.log(`\n${checks.length - failures.length}/${checks.length} checks passed`);
  if (failures.length) process.exit(1);
}

main().catch(error => { console.error(error); process.exit(1); });
