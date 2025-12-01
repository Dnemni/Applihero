import { openai, supabaseAdmin } from "@/lib/supabase/client";

const MAX_CHARS = 800;

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of text.split(/\n+/)) {
    if (!paragraph.trim()) continue;
    if ((current + "\n\n" + paragraph).length > MAX_CHARS) {
      if (current.trim()) chunks.push(current.trim());
      current = paragraph;
    } else {
      current += (current ? "\n\n" : "") + paragraph;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export async function ingestJobDocument(opts: {
  userId: string;
  jobId: string | null;
  jobDocumentId: string;
  content: string;
  replaceExisting?: boolean;
}) {
  const { userId, jobId, jobDocumentId, content, replaceExisting = true } = opts;

  const chunks = chunkText(content);
  if (!chunks.length) return;

  // Optionally clear existing chunks for this document to maintain idempotency
  if (replaceExisting) {
    const { error: delErr } = await supabaseAdmin
      .from("job_document_chunks")
      .delete()
      .eq("job_document_id", jobDocumentId);
    if (delErr) {
      console.error("Failed deleting existing chunks", delErr);
      // Continue anyway – we can still append
    }
  }

  const embRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: chunks,
  });

  const rows = chunks.map((chunk, i) => ({
    job_document_id: jobDocumentId,
    user_id: userId,
    job_id: jobId,
    chunk_index: i,
    content: chunk,
    embedding: JSON.stringify(embRes.data[i].embedding), // Store as JSON string
  }));

  const { error } = await supabaseAdmin
    .from("job_document_chunks")
    .insert(rows as any);

  if (error) throw error;
}
