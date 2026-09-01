import { NextRequest, NextResponse } from "next/server";
import { hasCronAuthorization } from "@/lib/discovery/cron";
import { enqueueHourlyDiscoveryTasks, hourlyBucket } from "@/lib/discovery/ingestion-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (!hasCronAuthorization(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requestedBucket = request.nextUrl.searchParams.get("scheduledFor");
  const parsed = requestedBucket ? new Date(requestedBucket) : new Date();
  if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: "Invalid scheduledFor timestamp" }, { status: 400 });
  try {
    return NextResponse.json(await enqueueHourlyDiscoveryTasks(hourlyBucket(parsed)));
  } catch (error) {
    console.error("Discovery dispatch failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dispatch failed" }, { status: 500 });
  }
}
