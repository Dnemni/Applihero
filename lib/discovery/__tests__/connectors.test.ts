import assert from "node:assert/strict";
import test from "node:test";
import { fetchSourceJobsWithMeta, hydrateSourceJob, sourceFromCareerUrl } from "../connectors";
import { parseJobRequirements } from "../parser";
import { analyzeJobFit } from "../matcher";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

test("Workday uses accepted page sizes and preserves relative publication provenance", { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  const offsets: number[] = [];
  global.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    offsets.push(body.offset);
    const rows = Array.from({ length: 20 }, (_, index) => ({
      title: `Role ${body.offset + index}`,
      externalPath: `/job/role-${body.offset + index}`,
      bulletFields: [`R${body.offset + index}`],
      locationsText: "Remote",
      postedOn: index < 3 ? "Posted Today" : "Posted 2 Days Ago",
    }));
    return jsonResponse({ total: 200, jobPostings: rows });
  };
  try {
    const result = await fetchSourceJobsWithMeta({
      provider: "workday",
      external_key: "acme/External",
      config: { host: "acme.wd5.myworkdayjobs.com", tenant: "acme", site: "External" },
    }, { mode: "bootstrap", maxJobs: 40 });
    assert.deepEqual(offsets, [0, 20]);
    assert.equal(result.jobs.length, 40);
    assert.equal(result.jobs[0].source_published_precision, "relative_day");
    assert.equal(result.jobs[0].source_published_source, "workday.postedOn");
    assert.equal(result.meta.authoritative, false);
    assert.equal(result.meta.boardTotal, 200);
  } finally {
    global.fetch = originalFetch;
  }
});

test("Eightfold handles camelCase payloads and bounds a warm frontier", { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  const starts: number[] = [];
  global.fetch = async input => {
    const url = new URL(String(input));
    const start = Number(url.searchParams.get("start") || 0);
    starts.push(start);
    return jsonResponse({ data: {
      count: 2_000,
      sortBy: "timestamp",
      positions: Array.from({ length: 20 }, (_, index) => ({
        atsJobId: `MS-${start + index}`,
        name: `Engineer ${start + index}`,
        canonicalPositionUrl: `/careers/job/${start + index}`,
        locations: ["Redmond, WA"],
        postedTs: 1_788_000_000_000 - (start + index) * 1_000,
      })),
    } });
  };
  try {
    const result = await fetchSourceJobsWithMeta({
      provider: "eightfold",
      external_key: "microsoft.com",
      config: {
        apiUrl: "https://apply.careers.microsoft.com/api/pcsx/search",
        domain: "microsoft.com",
        origin: "https://apply.careers.microsoft.com",
      },
    }, {
      mode: "incremental",
      knownJobIds: new Set(["MS-0"]),
      lastFullScanAt: new Date().toISOString(),
      scanState: { frontierPages: 3 },
      maxJobs: 100,
    });
    assert.deepEqual(starts, [0, 20, 40]);
    assert.equal(result.jobs.length, 60);
    assert.equal(result.jobs[0].source_job_id, "MS-0");
    assert.equal(result.meta.strategy, "pcsx_timestamp_frontier");
  } finally {
    global.fetch = originalFetch;
  }
});

test("Eightfold hydrates complete job details from first-party schema.org data", { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  global.fetch = async input => {
    assert.equal(String(input), "https://apply.careers.microsoft.com/careers/job/123");
    const response = new Response(`<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org", "@type": "JobPosting", title: "Software Engineering Intern",
      description: "<p>Currently pursuing a Bachelor's degree in Computer Science.</p>",
      employmentType: "FULL_TIME", validThrough: "2027-01-01T00:00:00Z",
      url: "https://apply.careers.microsoft.com/careers/job/123",
    })}</script>`, { status: 200, headers: { "content-type": "text/html" } });
    Object.defineProperty(response, "url", { value: String(input) });
    return response;
  };
  try {
    const hydrated = await hydrateSourceJob({ provider: "eightfold" }, {
      source_job_id: "MS-123", title: "Software Engineering Intern", description: "", description_html: null,
      location: "Redmond, WA", workplace_type: null, employment_type: "internship", departments: [],
      source_url: "https://apply.careers.microsoft.com/careers/job/123",
      apply_url: "https://apply.careers.microsoft.com/careers/job/123", source_published_at: null,
      source_updated_at: null, application_deadline: null, raw_payload: {} as any, parsed_requirements: [],
      parser_version: "test", content_hash: "test",
    });
    assert.match(hydrated.description, /Bachelor's degree/);
    assert.equal(hydrated.application_deadline, "2027-01-01T00:00:00Z");
    assert.equal(hydrated.source_job_id, "MS-123");
  } finally {
    global.fetch = originalFetch;
  }
});

test("Workable uses the public account feed with detail content", { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  let requested = "";
  global.fetch = async input => {
    requested = String(input);
    return jsonResponse({ jobs: [{
      shortcode: "ABC123",
      title: "Software Engineer Intern",
      description: "<p>Build useful software.</p>",
      location: { location_str: "Athens, Greece", workplace_type: "hybrid" },
      url: "https://apply.workable.com/acme/j/ABC123",
      published_on: "2026-08-20T12:00:00Z",
    }] });
  };
  try {
    const result = await fetchSourceJobsWithMeta({
      provider: "workable", external_key: "acme", config: { account: "acme" },
    });
    assert.equal(requested, "https://www.workable.com/api/accounts/acme?details=true");
    assert.equal(result.jobs[0].description, "Build useful software.");
    assert.equal(result.meta.authoritative, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("SmartRecruiters lists jobs and hydrates the official posting detail", { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  global.fetch = async input => {
    const url = String(input);
    if (url.includes("?limit=1&offset=0")) return jsonResponse({ totalFound: 1, content: [{
      id: "SR-1", name: "Software Engineering Intern", releasedDate: "2026-08-26T12:00:00Z",
      location: { fullLocation: "San Francisco, CA, United States", hybrid: true },
      typeOfEmployment: { label: "Internship" }, company: { identifier: "Acme" },
    }] });
    if (url.endsWith("/postings/SR-1")) return jsonResponse({
      id: "SR-1", name: "Software Engineering Intern", releasedDate: "2026-08-26T12:00:00Z",
      postingUrl: "https://jobs.smartrecruiters.com/Acme/SR-1-software-engineering-intern",
      applyUrl: "https://jobs.smartrecruiters.com/Acme/SR-1-software-engineering-intern?oga=true",
      location: { fullLocation: "San Francisco, CA, United States", hybrid: true },
      typeOfEmployment: { label: "Internship" },
      jobAd: { sections: { qualifications: { title: "Qualifications", text: "<p>Currently pursuing a Bachelor's degree in Computer Science.</p>" } } },
    });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const source = { provider: "smartrecruiters" as const, external_key: "Acme", config: { company: "Acme", maxJobs: 1 } };
    const result = await fetchSourceJobsWithMeta(source);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].description, "");
    const hydrated = await hydrateSourceJob(source, result.jobs[0]);
    assert.match(hydrated.description, /Bachelor's degree/);
    assert.equal(hydrated.workplace_type, "hybrid");
  } finally {
    global.fetch = originalFetch;
  }
});

test("Jibe normalizes its first-party jobs API without leaking location internals", { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  global.fetch = async input => {
    assert.equal(String(input), "https://careers.amd.com/api/jobs?limit=100&page=1&sort_by=recent");
    return jsonResponse({ totalCount: 1_190, jobs: [{ data: {
      slug: "91477", req_id: "91477", title: "Software Engineering Intern",
      description: "<p>Build and test software.</p>", full_location: "Austin, Texas",
      location_type: "LAT_LNG", employment_type: "Internship",
      posted_date: "2026-08-25T12:00:00+0000", update_date: "2026-08-25T13:00:00Z",
      apply_url: "https://careers-amd.icims.com/jobs/91477/login",
      meta_data: { canonical_url: "https://careers.amd.com/jobs/91477?lang=en-us" },
    } }] });
  };
  try {
    const result = await fetchSourceJobsWithMeta({
      provider: "jibe", external_key: "careers.amd.com",
      config: { baseUrl: "https://careers.amd.com", maxJobs: 100 },
    }, { maxJobs: 100 });
    assert.equal(result.jobs[0].source_job_id, "91477");
    assert.equal(result.jobs[0].workplace_type, null);
    assert.equal(result.jobs[0].source_published_source, "jibe.posted_date");
    assert.equal(result.jobs[0].description, "Build and test software.");
  } finally {
    global.fetch = originalFetch;
  }
});

test("generic career pages inventory linked roles and hydrate details separately", { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  global.fetch = async input => {
    const url = String(input);
    const html = url.endsWith("/jobs")
      ? `<main><a href="/jobs/software-engineer-12345">Software Engineer Intern</a></main>`
      : `<main><h1>Software Engineer Intern</h1><section><h2>Qualifications</h2><p>Currently pursuing a bachelor's degree in Computer Science and proficient in Python.</p><p>Join the engineering team to build reliable developer tools for customers around the world.</p></section></main>`;
    const response = new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };
  try {
    const source = { provider: "career_site" as const, external_key: "acme/jobs", career_url: "https://careers.acme.com/jobs", config: { maxJobs: 5 } };
    const result = await fetchSourceJobsWithMeta(source);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].description, "");
    const hydrated = await hydrateSourceJob(source, result.jobs[0]);
    assert.match(hydrated.description, /bachelor's degree/);
    assert.equal(hydrated.title, "Software Engineer Intern");
  } finally {
    global.fetch = originalFetch;
  }
});

test("Avature consumes the provider RSS inventory without treating snippets as requirements", { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  global.fetch = async input => {
    const response = new Response(`<?xml version="1.0"?><rss><channel><item>
      <title><![CDATA[Game Engineering Intern]]></title>
      <link>https://jobs.acme.com/en_US/careers/JobDetail/Game-Engineering-Intern/12345</link>
      <pubDate>Wed, 26 Aug 2026 12:00:00 +0000</pubDate>
    </item></channel></rss>`, { status: 200, headers: { "content-type": "application/rss+xml" } });
    Object.defineProperty(response, "url", { value: String(input) });
    return response;
  };
  try {
    const result = await fetchSourceJobsWithMeta({
      provider: "avature", external_key: "jobs.acme.com/careers",
      config: { baseUrl: "https://jobs.acme.com", locale: "en_US", portal: "careers", maxJobs: 5 },
    });
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].source_job_id, "12345");
    assert.equal(result.jobs[0].title, "Game Engineering Intern");
    assert.equal(result.jobs[0].source_published_source, "avature.rss.pubDate");
  } finally {
    global.fetch = originalFetch;
  }
});

test("known branded URLs resolve to their provider adapters", () => {
  assert.equal(sourceFromCareerUrl("NVIDIA", "https://jobs.nvidia.com/careers").provider, "workday");
  assert.equal(sourceFromCareerUrl("Microsoft", "https://apply.careers.microsoft.com/careers").provider, "eightfold");
  assert.equal(sourceFromCareerUrl("Netguru", "https://apply.workable.com/netguru").provider, "workable");
  assert.equal(sourceFromCareerUrl("AMD", "https://careers.amd.com/careers-home/jobs").provider, "jibe");
  assert.equal(sourceFromCareerUrl("Canva", "https://careers.smartrecruiters.com/Canva").provider, "smartrecruiters");
  assert.equal(sourceFromCareerUrl("JPMorgan Chase", "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1002/jobs").provider, "oracle");
  assert.equal(sourceFromCareerUrl("Morgan Stanley", "https://morganstanley.eightfold.ai/careers?domain=morganstanley.com").provider, "eightfold");
});

test("AMD-style Jibe sections keep real qualifications and discard legal footer copy", () => {
  const requirements = parseJobRequirements([
    "JOB DETAILS:",
    "Onsite/Hybrid: This role requires the student to work full time (40 hours a week) throughout the intern term.",
    "WHAT YOU WILL BE DOING:",
    "Develop and complete automated and manual test plans.",
    "WHO WE ARE LOOKING FOR:",
    "You are currently enrolled in a US based University in a Masters degree program majoring in Computer Science or a related discipline.",
    "Programming and scripting skills like Python, C++, or Selenium.",
    "Note: By submitting your application, you are indicating your interest in AMD intern positions.",
    "We are recruiting for multiple positions, and if your experience aligns, a recruiter will contact you.",
    "This role is not eligible for visa sponsorship.",
    "Benefits offered are described: AMD benefits at a glance.",
    "AMD may use Artificial Intelligence to screen applicants. AMD's Responsible AI Policy is available here.",
  ].join("\n"));
  const text = requirements.map(item => item.text).join("\n");
  assert.match(text, /Masters degree program/);
  assert.match(text, /visa sponsorship/);
  assert.match(text, /work full time/);
  assert.doesNotMatch(text, /Develop and complete automated/);
  assert.doesNotMatch(text, /Benefits offered/);
  assert.doesNotMatch(text, /Responsible AI Policy/);
  assert.doesNotMatch(text, /submitting your application/);
  assert.doesNotMatch(text, /recruiter will contact/);
});

test("responsibility and marketing sections never become NVIDIA-style minimum requirements", () => {
  const requirements = parseJobRequirements([
    "Intelligent machines powered by AI computers are no longer science fiction.",
    "What you will be doing:",
    "Work and develop state of the art techniques in deep learning and data analytics.",
    "You will provide AI solutions using GPUs working directly with key customers.",
    "What we need to see:",
    "Pursuing MS, or PhD degree in an engineering or computer science related field.",
    "Programming proficiency in C/C++ with a deep understanding of algorithms.",
    "Experience with parallel programming, ideally CUDA C/C++.",
    "We are proud to foster a diverse work environment and do not discriminate on the basis of protected characteristics.",
  ].join("\n"));
  const text = requirements.map(item => item.text).join("\n");
  assert.match(text, /Pursuing MS/);
  assert.match(text, /Programming proficiency/);
  assert.doesNotMatch(text, /Intelligent machines/);
  assert.doesNotMatch(text, /Work and develop/);
  assert.doesNotMatch(text, /provide AI solutions/);
  assert.doesNotMatch(text, /do not discriminate/);
});

test("Lever What We Value sections are candidate criteria, not automatically preferred", () => {
  const requirements = parseJobRequirements([
    "The Role",
    "Build software and deliver customer outcomes.",
    "What We Value",
    "Pursuing a degree in Computer Science or Software Engineering.",
    "Proficiency with Python, Java, C++, or TypeScript.",
  ].join("\n"));
  assert.equal(requirements.length, 2);
  assert.ok(requirements.every(item => item.priority === "minimum"));
});

test("an explicit master's enrollment requirement is a hard conflict for a current bachelor's student", async () => {
  const description = [
    "WHO WE ARE LOOKING FOR:",
    "You are currently enrolled in a US based University in a Masters degree program majoring in Computer Science or a related discipline.",
    "Programming and scripting skills like Python or C++.",
  ].join("\n");
  const analysis = await analyzeJobFit({
    id: "amd-masters-test",
    source_id: "amd",
    source_job_id: "91477",
    title: "2027 Masters Software Test Engineering Intern/Co-Op",
    company_name: "AMD",
    location: "Austin, TX",
    workplace_type: "hybrid",
    employment_type: "internship",
    departments: ["Engineering"],
    description,
    description_html: description,
    apply_url: "https://careers.amd.com/jobs/91477",
    source_url: "https://careers.amd.com/jobs/91477",
    source_published_at: "2026-08-25T00:00:00.000Z",
    source_updated_at: null,
    application_deadline: null,
    discovered_at: "2026-08-25T00:00:00.000Z",
    last_verified_at: "2026-08-25T00:00:00.000Z",
    status: "open",
    parsed_requirements: parseJobRequirements(description),
    parser_version: "test",
    content_hash: "test",
  }, "Purdue University Aug. 2024 – May 2028\nB.S. in Computer Science & Artificial Intelligence\nMA 16500 Analytic Geometry & Calculus I\nPython, C++");
  assert.equal(analysis.score, 0);
  assert.equal(analysis.eligibility.status, "conflict");
  assert.equal(analysis.requirements.find(item => /Masters degree program/.test(item.requirement))?.status, "conflicting");
});
