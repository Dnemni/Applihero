import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { verifyDiscoveryContentStore } = await import("../lib/discovery/content-store");
  const result = await verifyDiscoveryContentStore();
  console.log(`R2 discovery content check passed for private bucket ${result.bucket}.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
