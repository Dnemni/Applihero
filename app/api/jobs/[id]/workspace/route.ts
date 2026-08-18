import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { getApplicationWorkspaceContext } from "@/lib/applications/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser(request);
    return NextResponse.json(await getApplicationWorkspaceContext(user.id, params.id));
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : error instanceof Error && error.message === "Application not found" ? 404 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load application workspace" }, { status });
  }
}
