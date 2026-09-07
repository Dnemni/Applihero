import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Run only against a newly initialized, disposable Unix-socket cluster.
const socket = process.argv[2] || "";
if (!/^\/private\/tmp\/applihero-db-test\.[A-Za-z0-9]+$/.test(socket)) throw new Error("Pass an isolated /private/tmp/applihero-db-test.* socket directory");
const run = promisify(execFile);
const args = ["-h", socket, "-p", "55439", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = async (query: string) => (await run("psql", [...args, "-c", query])).stdout.trim();
const testDatabase = "discovery_test_" + randomUUID().replaceAll("-", "");
let createdDatabase = false;
async function main() {
  await sql(`CREATE DATABASE ${testDatabase}`);
  createdDatabase = true;
  args[5] = testDatabase;
  await sql(`
    DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
    CREATE TABLE job_sources(id uuid PRIMARY KEY, enabled boolean DEFAULT true, scan_lock_token uuid, scan_locked_until timestamptz, last_successful_scan_at timestamptz);
    CREATE TABLE user_discovery_preferences(user_id uuid PRIMARY KEY, email_enabled boolean DEFAULT true, next_digest_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE user_job_source_subscriptions(user_id uuid, source_id uuid, enabled boolean DEFAULT true);
    CREATE TABLE discovery_jobs(id uuid PRIMARY KEY, title text, company_name text, description text, status text DEFAULT 'open', enrichment_status text DEFAULT 'pending');
    CREATE TABLE jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, discovery_job_id uuid, job_title text, company_name text, job_description text, status text, created_at timestamptz DEFAULT now());
    CREATE TABLE discovery_enrichment_queue(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), discovery_job_id uuid, source_id uuid, status text DEFAULT 'pending', attempts integer DEFAULT 0, priority integer DEFAULT 100, next_attempt_at timestamptz DEFAULT now(), locked_at timestamptz, lock_token uuid, last_error text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
  `);
  for (const migration of [
    "20260827000000_add_discovery_ingestion_task_queue.sql",
    "20260902000000_harden_discovery_queue_operations.sql",
    "20260906000000_harden_discovery_enrichment_queue.sql",
    "20260906010000_add_discovery_source_task_leases.sql",
    "20260906040000_add_atomic_discovery_workspace.sql",
    "20260906050000_count_interrupted_enrichment_attempts.sql",
    "20260906060000_add_discovery_capacity_snapshot.sql",
  ]) await run("psql", [...args, "-f", `supabase/migrations/${migration}`]);
  const user = randomUUID(), source = randomUUID(), job = randomUUID();
  await sql(`INSERT INTO job_sources(id) VALUES ('${source}'); INSERT INTO discovery_jobs(id,title,company_name,description) VALUES ('${job}','Role','Company','Original saved description'); INSERT INTO user_discovery_preferences(user_id) VALUES ('${user}');`);
  const enqueues = await Promise.all(Array.from({ length: 5 }, () => sql("SELECT created_count FROM enqueue_discovery_ingestion_hour()")));
  assert.equal(enqueues.reduce((sum, value) => sum + Number(value), 0), 1);
  const claims = await Promise.all(Array.from({ length: 5 }, () => sql(`SELECT id FROM claim_discovery_ingestion_tasks(1,'${randomUUID()}')`)));
  assert.equal(claims.filter(Boolean).length, 1);
  const leases = await Promise.all(Array.from({ length: 5 }, () => sql(`SELECT acquire_discovery_source_lease('${source}','${randomUUID()}')`)));
  assert.equal(leases.filter(value => value === "t").length, 1);
  const digests = await Promise.all(Array.from({ length: 5 }, () => sql(`SELECT user_id FROM claim_discovery_digest_preferences(1,'${randomUUID()}')`)));
  assert.equal(digests.filter(Boolean).length, 1);
  await sql(`INSERT INTO discovery_enrichment_queue(discovery_job_id,source_id) VALUES ('${job}','${source}');`);
  const enrichment = await Promise.all(Array.from({ length: 5 }, () => sql(`SELECT id FROM claim_discovery_enrichment(1,'${randomUUID()}')`)));
  assert.equal(enrichment.filter(Boolean).length, 1);
  assert.equal(await sql("SELECT attempts FROM discovery_enrichment_queue"), "1");
  await sql("UPDATE discovery_enrichment_queue SET attempts=7,locked_at=now()-interval '11 minutes'");
  assert.equal(await sql(`SELECT attempts FROM claim_discovery_enrichment(1,'${randomUUID()}')`), "8");
  await sql("UPDATE discovery_enrichment_queue SET locked_at=now()-interval '11 minutes'");
  assert.equal(await sql(`SELECT count(*) FROM claim_discovery_enrichment(1,'${randomUUID()}')`), "0");
  assert.equal(await sql("SELECT status FROM discovery_enrichment_queue"), "dead");
  const starts = await Promise.all(Array.from({ length: 8 }, async () => JSON.parse(await sql(`SELECT start_discovery_workspace('${user}','${job}')`))));
  assert.equal(new Set(starts.map(row => row.jobId)).size, 1);
  assert.equal(starts.filter(row => row.existing === false).length, 1);
  await sql(`UPDATE discovery_jobs SET status='closed',description='Employer edited text' WHERE id='${job}';`);
  const reopened = JSON.parse(await sql(`SELECT start_discovery_workspace('${user}','${job}')`));
  assert.equal(reopened.jobId, starts[0].jobId);
  assert.equal(await sql(`SELECT job_description FROM jobs WHERE id='${reopened.jobId}'`), "Original saved description");
  assert.deepEqual(JSON.parse(await sql(`SELECT start_discovery_workspace('${randomUUID()}','${job}')`)), { unavailable: true });
  await sql(`UPDATE job_sources SET last_successful_scan_at=now(); UPDATE discovery_ingestion_tasks SET status='failed',lease_token=null,lease_expires_at=null;`);
  assert.equal(await sql("SELECT reconcile_discovery_ingestion_tasks()"), "1");
  assert.equal(await sql("SELECT has_function_privilege('authenticated','public.start_discovery_workspace(uuid,uuid)','EXECUTE')"), "f");
  const capacity = JSON.parse(await sql("SELECT get_discovery_capacity_snapshot()"));
  assert.ok(capacity.databaseBytes > 0);
  assert.ok(capacity.relations.some((row: any) => row.table === "discovery_jobs" && row.totalBytes > 0));
  assert.equal(await sql("SELECT has_function_privilege('authenticated','public.get_discovery_capacity_snapshot()','EXECUTE')"), "f");
  console.log("PASS: concurrent dispatch, task/source/digest/enrichment claims, atomic workspace creation, closed-role continuity, snapshot preservation, reconciliation and RPC permissions");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (createdDatabase) {
    args[5] = "postgres";
    await sql(`DROP DATABASE ${testDatabase}`);
  }
});
