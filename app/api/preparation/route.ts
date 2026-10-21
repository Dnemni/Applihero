import { NextRequest, NextResponse } from "next/server";
import { execute, read } from "@/lib/preparation/local-store";
export const dynamic = "force-dynamic";
function allowed(r: NextRequest) {
    const origin = r.headers.get("origin");
    return process.env.PREPARATION_LOCAL_DEMO === "1" && process.env.NODE_ENV !== "production" && r.headers.get("host") === "localhost:3000" && (!origin || origin === "http://localhost:3000" || origin === `chrome-extension://${process.env.PREPARATION_EXTENSION_ID}`) && r.headers.get("authorization") === `Bearer ${process.env.PREPARATION_DEMO_TOKEN}` && Boolean(process.env.PREPARATION_DEMO_TOKEN?.length && process.env.PREPARATION_DEMO_TOKEN.length >= 32);
}
export async function GET(r: NextRequest) {
    if (!allowed(r))
        return NextResponse.json({ error: "Local demo disabled or unauthorized" }, { status: 401 });
    return NextResponse.json(await read(r.nextUrl.searchParams.get("application") || undefined), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(r: NextRequest) {
    if (!allowed(r))
        return NextResponse.json({ error: "Local demo disabled or unauthorized" }, { status: 401 });
    try {
        const body = await r.text();
        if (body.length > 300000)
            return NextResponse.json({ error: "Too large" }, { status: 413 });
        return NextResponse.json(await execute(JSON.parse(body), r.nextUrl.searchParams.get("application") || undefined));
    }
    catch (e) {
        const message = e instanceof Error ? e.message : "Invalid request";
        return NextResponse.json({ error: message }, { status: /^409/.test(message) ? 409 : 400 });
    }
}
