import assert from "node:assert/strict";
import test from "node:test";
import { applyCatalogFilterSteps, buildCatalogFilterSteps, buildCatalogLocationSteps } from "../catalog-filters";

const usCountry = { preferredCountry: "US", preferredRegions: [], locationScope: "country" as const, includeRemote: true };

test("user filters search title and company only, normalize workplace, and bound freshness", () => {
  const now = Date.parse("2026-09-04T12:00:00Z");
  assert.deepEqual(buildCatalogFilterSteps({ query: "ML (engineer), 100%", company: "Roblox", location: "Austin", workplace: "on-site", freshness: 7, now }), [
    ["eq", "status", "open"],
    ["or", "title.ilike.%ML engineer 100%,company_name.ilike.%ML engineer 100%"],
    ["ilike", "company_name", "%Roblox%"],
    ["ilike", "location", "%Austin%"],
    ["or", "workplace_type.ilike.on-site,workplace_type.ilike.onsite"],
    ["gte", "source_published_at", "2026-08-28T12:00:00.000Z"],
  ]);
  assert.deepEqual(buildCatalogFilterSteps({ workplace: "Remote" }), [["eq", "status", "open"], ["ilike", "workplace_type", "remote"]]);
  assert.deepEqual(buildCatalogFilterSteps({ freshness: 0 }), [["eq", "status", "open"]]);
});

test("location steps mirror the strict in-memory rule", () => {
  assert.deepEqual(buildCatalogLocationSteps(usCountry), [["or", "and(location_remote.eq.true,or(location_countries.eq.{},location_countries.cs.{US})),and(location_remote.eq.false,location_countries.cs.{US})"]]);
  assert.deepEqual(buildCatalogLocationSteps({ ...usCountry, includeRemote: false }), [["eq", "location_remote", false], ["or", "location_countries.cs.{US}"]]);
  assert.deepEqual(buildCatalogLocationSteps({ ...usCountry, locationScope: "worldwide" }), []);
  assert.deepEqual(buildCatalogLocationSteps({ ...usCountry, locationScope: "worldwide", includeRemote: false }), [["eq", "location_remote", false]]);
  assert.deepEqual(buildCatalogLocationSteps({ ...usCountry, preferredCountry: "" }), [], "no saved country keeps the catalog broad");
  assert.deepEqual(buildCatalogLocationSteps({ ...usCountry, preferredCountry: "usa" }), [["or", "and(location_remote.eq.true,or(location_countries.eq.{},location_countries.cs.{US})),and(location_remote.eq.false,location_countries.cs.{US})"]]);
  assert.deepEqual(buildCatalogLocationSteps({ ...usCountry, locationScope: "regions", preferredRegions: ["California", "New York"] }), [
    ["or", 'and(location_remote.eq.true,or(location_countries.eq.{},location_countries.cs.{US})),and(location_remote.eq.false,and(location_countries.cs.{US},or(location.imatch."(^|[^a-z])california($|[^a-z])",location.imatch."(^|[^a-z])new york($|[^a-z])")))'],
  ]);
  assert.deepEqual(buildCatalogLocationSteps({ ...usCountry, locationScope: "regions", preferredRegions: [] }), [["or", "and(location_remote.eq.true,or(location_countries.eq.{},location_countries.cs.{US})),and(location_remote.eq.false,location_countries.cs.{US})"]]);
});

test("steps apply in order to a builder", () => {
  const calls: string[] = [];
  const builder: any = new Proxy({}, { get: (_target, method) => (...args: unknown[]) => { calls.push(`${String(method)}(${args.map(value => JSON.stringify(value)).join(",")})`); return builder; } });
  applyCatalogFilterSteps(builder, [["eq", "status", "open"], ["or", "a.eq.1,b.eq.2"], ["contains", "location_countries", ["US"]], ["gte", "x", "y"]]);
  assert.deepEqual(calls, ['eq("status","open")', 'or("a.eq.1,b.eq.2")', 'contains("location_countries",["US"])', 'gte("x","y")']);
});
