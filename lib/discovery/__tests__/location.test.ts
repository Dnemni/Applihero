import assert from "node:assert/strict";
import test from "node:test";
import { matchesDiscoveryLocation } from "../location";

const usCountry = { preferredCountry: "US", preferredRegions: [], locationScope: "country" as const, includeRemote: true };

test("country preference excludes foreign roles while retaining US locations", () => {
  assert.equal(matchesDiscoveryLocation({ location: "Berlin, Germany", workplace_type: "on-site" }, usCountry), false);
  assert.equal(matchesDiscoveryLocation({ location: "New York, NY, United States", workplace_type: "on-site" }, usCountry), true);
  assert.equal(matchesDiscoveryLocation({ location: "Austin, Texas", workplace_type: "hybrid" }, usCountry), true);
});

test("regional preference is stricter than country preference and honors remote choice", () => {
  const regions = { ...usCountry, preferredRegions: ["California", "CA"], locationScope: "regions" as const, includeRemote: false };
  assert.equal(matchesDiscoveryLocation({ location: "San Francisco, CA, United States", workplace_type: "hybrid" }, regions), true);
  assert.equal(matchesDiscoveryLocation({ location: "New York, NY, United States", workplace_type: "on-site" }, regions), false);
  assert.equal(matchesDiscoveryLocation({ location: "Remote - United States", workplace_type: "remote" }, regions), false);
});
