import assert from "node:assert/strict";
import test from "node:test";
import { classifyDiscoveryLocation, decodeLocationPreferences, matchesDiscoveryLocation, regionPattern } from "../location";

const usCountry = { preferredCountry: "US", preferredRegions: [], locationScope: "country" as const, includeRemote: true };

test("country preference excludes foreign roles while retaining US locations", () => {
  assert.equal(matchesDiscoveryLocation({ location: "Berlin, Germany", workplace_type: "on-site" }, usCountry), false);
  assert.equal(matchesDiscoveryLocation({ location: "New York, NY, United States", workplace_type: "on-site" }, usCountry), true);
  assert.equal(matchesDiscoveryLocation({ location: "Austin, Texas", workplace_type: "hybrid" }, usCountry), true);
  assert.equal(matchesDiscoveryLocation({ location: "Austin, TX", workplace_type: "hybrid" }, usCountry), true);
  assert.equal(matchesDiscoveryLocation({ location: "India, Karnataka, Bangalore", workplace_type: null }, usCountry), false);
  assert.equal(matchesDiscoveryLocation({ location: "Hyderabad, , India", workplace_type: null }, usCountry), false);
});

test("regional preference is stricter than country preference and honors remote choice", () => {
  const regions = { ...usCountry, preferredRegions: ["California", "CA"], locationScope: "regions" as const, includeRemote: false };
  assert.equal(matchesDiscoveryLocation({ location: "San Francisco, CA, United States", workplace_type: "hybrid" }, regions), true);
  assert.equal(matchesDiscoveryLocation({ location: "New York, NY, United States", workplace_type: "on-site" }, regions), false);
  assert.equal(matchesDiscoveryLocation({ location: "Remote - United States", workplace_type: "remote" }, regions), false);
  assert.equal(matchesDiscoveryLocation({ location: "Remote - United States", workplace_type: "remote" }, { ...regions, includeRemote: true }), true);
});

test("multi-location postings pass when any listed place satisfies the scope", () => {
  assert.equal(matchesDiscoveryLocation({ location: "Cork, Ireland; Dublin, Ireland", workplace_type: null }, usCountry), false);
  assert.equal(matchesDiscoveryLocation({ location: "Berlin, Germany; New York, NY", workplace_type: null }, usCountry), true);
  assert.equal(matchesDiscoveryLocation({ location: "London, UK | Seattle, WA", workplace_type: "on-site" }, { ...usCountry, preferredCountry: "GB" }), true);
  const classification = classifyDiscoveryLocation("Berlin, Germany; New York, NY", "on-site");
  assert.deepEqual(classification.countries, ["DE", "US"]);
  assert.equal(classification.remote, false);
  assert.equal(classification.segments.length, 2);
});

test("blank or unrecognized locations fail strict scopes and pass worldwide", () => {
  for (const location of ["", null, "Field office", "Multiple locations"]) {
    assert.equal(matchesDiscoveryLocation({ location, workplace_type: "on-site" }, usCountry), false, String(location));
    assert.equal(matchesDiscoveryLocation({ location, workplace_type: "on-site" }, { ...usCountry, locationScope: "regions", preferredRegions: ["CA"] }), false, String(location));
    assert.equal(matchesDiscoveryLocation({ location, workplace_type: "on-site" }, { ...usCountry, locationScope: "worldwide" }), true, String(location));
    assert.deepEqual(classifyDiscoveryLocation(location).countries, []);
  }
  assert.equal(matchesDiscoveryLocation({ location: "Paris, France", workplace_type: null }, { ...usCountry, preferredCountry: "" }), true, "no saved country keeps the feed broad");
});

test("remote roles are location-agnostic unless they name a country, which must then match", () => {
  assert.equal(matchesDiscoveryLocation({ location: "Remote", workplace_type: "remote" }, usCountry), true);
  assert.equal(matchesDiscoveryLocation({ location: "Remote - USA", workplace_type: "remote" }, usCountry), true);
  assert.equal(matchesDiscoveryLocation({ location: "Sydney, New South Wales, Australia", workplace_type: "remote" }, usCountry), false);
  assert.equal(matchesDiscoveryLocation({ location: "Sydney, New South Wales, Australia", workplace_type: "remote" }, { ...usCountry, locationScope: "worldwide" }), true);
  assert.equal(matchesDiscoveryLocation({ location: "Remote", workplace_type: "remote" }, { ...usCountry, includeRemote: false }), false);
});

test("remote detection covers workplace type and location text, and lower-case prose does not read as a US state", () => {
  assert.equal(classifyDiscoveryLocation("Anywhere", "remote").remote, true);
  assert.equal(classifyDiscoveryLocation("Remote (Germany)", null).remote, true);
  assert.deepEqual(classifyDiscoveryLocation("Remote (Germany)", null).countries, ["DE"]);
  assert.deepEqual(classifyDiscoveryLocation("remote in germany or france", null).countries, ["DE", "FR"]);
  assert.deepEqual(classifyDiscoveryLocation("Tbilisi, Georgia").countries, ["GE"]);
  assert.deepEqual(classifyDiscoveryLocation("Atlanta, Georgia").countries, ["US"]);
  assert.deepEqual(classifyDiscoveryLocation("Seoul, GANGNAM-GU, Korea, republic of").countries, ["KR"]);
  assert.deepEqual(classifyDiscoveryLocation("Toronto, Canada").countries, ["CA"]);
  assert.deepEqual(classifyDiscoveryLocation("San Jose, CA").countries, ["US"], "CA after a comma is California, not Canada");
});

test("well-known foreign cities resolve their country and beat colliding state codes", () => {
  assert.deepEqual(classifyDiscoveryLocation("Berlin, DE").countries, ["DE"], "Berlin, DE is Germany, not Delaware");
  assert.deepEqual(classifyDiscoveryLocation("Dover, DE").countries, ["US"]);
  assert.deepEqual(classifyDiscoveryLocation("London").countries, ["GB"]);
  assert.deepEqual(classifyDiscoveryLocation("Bengaluru").countries, ["IN"]);
  assert.deepEqual(classifyDiscoveryLocation("Toronto, ON").countries, ["CA"]);
  assert.equal(matchesDiscoveryLocation({ location: "Berlin, DE", workplace_type: "hybrid" }, usCountry), false);
  assert.equal(matchesDiscoveryLocation({ location: "Remote - Berlin", workplace_type: "remote" }, usCountry), false, "remote within Germany is not a US remote role");
});

test("saved preference rows decode with safe defaults", () => {
  assert.deepEqual(decodeLocationPreferences([]), { preferredCountry: "", preferredRegions: [], locationScope: "country", includeRemote: true });
  assert.deepEqual(decodeLocationPreferences([
    { question_key: "preference_country", normalized_value: "US" },
    { question_key: "preference_regions", normalized_value: "New%20York,CA" },
    { question_key: "preference_location_scope", normalized_value: "regions" },
    { question_key: "preference_remote", normalized_value: "no" },
  ]), { preferredCountry: "US", preferredRegions: ["New York", "CA"], locationScope: "regions", includeRemote: false });
  assert.equal(regionPattern("St. Louis"), "(^|[^a-z])st\\. louis($|[^a-z])");
});
