import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type SearchHit = { url: string; title?: string; excerpts?: string[]; [key: string]: unknown };

function flattenHits(value: unknown): SearchHit[] {
  const hits: SearchHit[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.url === "string") hits.push(record as SearchHit);
    Object.values(record).forEach(walk);
  };
  walk(value);
  return hits.filter((hit, index, all) => all.findIndex(other => other.url === hit.url) === index);
}

function parseTextPayload(content: unknown) {
  if (!Array.isArray(content)) return {};
  const text = content.flatMap(item => item && typeof item === "object" && (item as any).type === "text" ? [(item as any).text] : []).join("\n");
  try { return JSON.parse(text); } catch { return {}; }
}

export async function searchOfficialCompanyCareers(companyName: string): Promise<SearchHit[]> {
  const client = new Client({ name: "applihero-discovery", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("https://search.parallel.ai/mcp"), {
    requestInit: { headers: { "User-Agent": "AppliHero Job Monitor/1.0" } },
  });
  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "web_search",
      arguments: {
        search_queries: [
          `"${companyName}" official careers jobs`,
          `"${companyName}" official company website careers`,
          `"${companyName}" jobs Greenhouse Lever Ashby Workable Workday iCIMS Jibe`,
        ],
        objective: `Find the official corporate careers page and directly controlled applicant-tracking job board for ${companyName}. Return first-party company pages and its root job board. Exclude LinkedIn, Indeed, Glassdoor, ZipRecruiter, staffing sites, reposting sites, and unrelated employers.`,
      },
    }, undefined, { timeout: 45_000, maxTotalTimeout: 50_000 });
    if (result.isError) return [];
    return flattenHits(result.structuredContent || parseTextPayload(result.content));
  } catch {
    // Search improves discovery but must never make deterministic provider
    // discovery unavailable when the external search service is down.
    return [];
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function searchOfficialCompanyJobs(companyName: string, officialUrl: string): Promise<SearchHit[]> {
  const official = new URL(officialUrl);
  const client = new Client({ name: "applihero-job-index", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("https://search.parallel.ai/mcp"), {
    requestInit: { headers: { "User-Agent": "AppliHero Job Monitor/1.0" } },
  });
  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "web_search",
      arguments: {
        search_queries: [
          `site:${official.hostname} "${companyName}" open jobs`,
          `site:${official.hostname} "${companyName}" software engineering jobs`,
          `site:${official.hostname} "${companyName}" internship jobs`,
        ],
        objective: `Find current individual job-detail pages on ${official.hostname} for ${companyName}. Return direct official posting URLs, titles, and excerpts. Exclude search pages, category pages, expired mirrors, aggregators, and other employers.`,
      },
    }, undefined, { timeout: 45_000, maxTotalTimeout: 50_000 });
    if (result.isError) return [];
    return flattenHits(result.structuredContent || parseTextPayload(result.content));
  } catch {
    return [];
  } finally {
    await transport.close().catch(() => undefined);
  }
}
