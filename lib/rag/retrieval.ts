import { openai, supabaseAdmin } from "@/lib/supabase/client";

export async function retrieveContext(opts: {
  userId: string;
  jobId: string | null;
  query: string;
  matchCount?: number;
  minSimilarity?: number;
}) {
  const { userId, jobId, query, matchCount = 8, minSimilarity = 0 } = opts;

  const embRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  const embedding = embRes.data[0].embedding as unknown as number[];

  const { data, error } = await supabaseAdmin.rpc(
    "match_job_document_chunks",
    {
      query_embedding: embedding,
      match_count: matchCount,
      match_user_id: userId,
      match_job_id: jobId,
    } as any
  );

  if (error) throw error;
  const rows = (data ?? []) as { id: string; content: string; similarity: number }[];

  // Ensure deterministic ordering & filter threshold
  return rows
    .filter(r => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, matchCount);
}
