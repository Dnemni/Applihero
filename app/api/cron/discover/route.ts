import { NextRequest, NextResponse } from "next/server";
import { syncDueSources } from "@/lib/discovery/sync";
import { sendDueDiscoveryDigests } from "@/lib/discovery/digests";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const results = await syncDueSources({ limit: 12 });
    const digests = await sendDueDiscoveryDigests();
    return NextResponse.json({ scanned: results.length, results, digests });
  } catch (error) {
    console.error("Scheduled discovery scan failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scan failed" }, { status: 500 });
  }
}
