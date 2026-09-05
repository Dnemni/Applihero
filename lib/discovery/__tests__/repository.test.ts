import assert from "node:assert/strict";
import test from "node:test";
import { DiscoveryQueryTimeoutError, withQueryTimeout } from "../repository";

test("feed query timeout aborts a stalled PostgREST request and names its stage", async () => {
  const builder = {
    abortSignal(signal: AbortSignal) {
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
    },
  };
  await assert.rejects(() => withQueryTimeout(builder, 20, "catalog page"), (error: unknown) => {
    assert.ok(error instanceof DiscoveryQueryTimeoutError);
    assert.equal(error.stage, "catalog page");
    return true;
  });
});
