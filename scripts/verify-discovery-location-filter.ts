import { config } from "dotenv";

config({ path: ".env.local" });

type Fixture = {
  name: string;
  preferredCountry: string;
  preferredRegions: string[];
  locationScope: "regions" | "country" | "worldwide";
  includeRemote: boolean;
};

const fixtures: Fixture[] = [
  { name: "US country with remote", preferredCountry: "US", preferredRegions: [], locationScope: "country", includeRemote: true },
  { name: "US country without remote", preferredCountry: "US", preferredRegions: [], locationScope: "country", includeRemote: false },
  { name: "US California regions", preferredCountry: "US", preferredRegions: ["California", "CA", "San Francisco"], locationScope: "regions", includeRemote: true },
  { name: "worldwide without remote", preferredCountry: "", preferredRegions: [], locationScope: "worldwide", includeRemote: false },
  { name: "GB country", preferredCountry: "GB", preferredRegions: [], locationScope: "country", includeRemote: true },
];

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { applyCatalogFilterSteps, buildCatalogLocationSteps } = await import("../lib/discovery/catalog-filters");
  const { matchesDiscoveryLocation } = await import("../lib/discovery/location");
  const database = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
  const { data: jobs, error } = await database.from("discovery_jobs")
    .select("id,location,workplace_type")
    .eq("status", "open")
    .order("source_published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(1_000);
  if (error) throw new Error(`Apply and backfill the discovery location migration first: ${error.message}`);
  const ids = (jobs || []).map((job: any) => String(job.id));

  for (const fixture of fixtures) {
    const expected = new Set<string>((jobs || []).filter((job: any) => matchesDiscoveryLocation(job, fixture)).map((job: any) => String(job.id)));
    const actual = new Set<string>();
    for (let index = 0; index < ids.length; index += 200) {
      let query = database.from("discovery_jobs").select("id").in("id", ids.slice(index, index + 200));
      query = applyCatalogFilterSteps(query, buildCatalogLocationSteps(fixture));
      const response = await query;
      if (response.error) throw response.error;
      for (const row of response.data || []) actual.add(String(row.id));
    }
    const disagreements = [...new Set([...expected, ...actual])].filter(id => expected.has(id) !== actual.has(id));
    console.log({ fixture: fixture.name, expected: expected.size, actual: actual.size, disagreements: disagreements.slice(0, 10) });
    if (disagreements.length) throw new Error(`${fixture.name}: ${disagreements.length} database/in-memory location disagreements`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
