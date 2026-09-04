import { performance } from "node:perf_hooks";

export type RequestTimingSpan = { name: string; ms: number; detail?: string };

/**
 * Collects named spans for one request and renders them as a `Server-Timing`
 * header so browser devtools and the measurement script can attribute latency
 * to individual database calls without reading server logs.
 */
export function createRequestTimer() {
  const startedAt = performance.now();
  const spans: RequestTimingSpan[] = [];
  async function time<T>(name: string, work: () => Promise<T>, detail?: (result: T) => string | undefined): Promise<T> {
    const began = performance.now();
    try {
      const result = await work();
      spans.push({ name, ms: performance.now() - began, detail: detail?.(result) });
      return result;
    } catch (error) {
      spans.push({ name, ms: performance.now() - began, detail: "error" });
      throw error;
    }
  }
  function header() {
    const total = performance.now() - startedAt;
    return [...spans, { name: "total", ms: total }].map(formatServerTimingSpan).join(", ");
  }
  return { time, spans, header, elapsed: () => performance.now() - startedAt };
}

export function formatServerTimingSpan(span: RequestTimingSpan) {
  const name = span.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const description = span.detail ? `;desc="${span.detail.replace(/"/g, "'")}"` : "";
  return `${name};dur=${span.ms.toFixed(1)}${description}`;
}
