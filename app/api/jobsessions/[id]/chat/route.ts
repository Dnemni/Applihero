import { NextResponse } from "next/server";

export async function POST() {
  // later: RAG + LLM
  return NextResponse.json({
    reply: "This is a placeholder response from the coach."
  });
}
