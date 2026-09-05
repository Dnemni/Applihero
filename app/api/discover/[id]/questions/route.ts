import { NextRequest, NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/discovery/auth";
import { buildDiscoveryQuestions, pendingDiscoveryQuestions } from "@/lib/discovery/facts";
import { hashText } from "@/lib/discovery/parser";
import { evaluateDisplayFit } from "@/lib/discovery/rematch";
import {
  getDiscoveryJob,
  getUserBackground,
  getUserDiscoveryAnswers,
  getUserRecommendationFit,
  saveDiscoveryAnswer,
  saveRecommendationFit,
} from "@/lib/discovery/repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser(request);
    const job = await getDiscoveryJob(params.id, { ensureParsing: false });
    if (!job || job.status === "closed") return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const answers = await getUserDiscoveryAnswers(user.id, params.id);
    return NextResponse.json({ questions: pendingDiscoveryQuestions(job, answers), answers });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load questions" }, { status });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser(request);
    const [job, recommendation] = await Promise.all([
      getDiscoveryJob(params.id, { ensureParsing: false }),
      getUserRecommendationFit(user.id, params.id),
    ]);
    if (!job || job.status === "closed") return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const body = await request.json();
    const question = buildDiscoveryQuestions(job).find(item => item.key === body.questionKey);
    const option = question?.options.find(item => item.value === body.value);
    if (!question || !option) return NextResponse.json({ error: "Choose a valid answer" }, { status: 400 });
    const persistedCategory = question.category === "work_authorization" || question.category === "availability" || question.category === "location"
      ? question.category
      : null;
    if (!persistedCategory) return NextResponse.json({ error: "This question is not an eligibility question" }, { status: 400 });
    await saveDiscoveryAnswer(user.id, {
      question_key: question.key,
      category: persistedCategory,
      question: question.prompt,
      answer: option.label,
      normalized_value: option.value,
      reuse_approved: body.reuseApproved === true,
      source_job_id: params.id,
    });
    const background = await getUserBackground(user.id, params.id);
    const quickFit = evaluateDisplayFit(job, { background, profileHash: hashText(background) });
    if (recommendation) await saveRecommendationFit(user.id, params.id, quickFit);
    const answers = await getUserDiscoveryAnswers(user.id, params.id);
    return NextResponse.json({ questions: pendingDiscoveryQuestions(job, answers), answers, quickFit });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save answer" }, { status });
  }
}
