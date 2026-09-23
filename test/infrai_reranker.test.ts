import assert from "node:assert/strict";
import test from "node:test";
import { InfraiReranker } from "../src/infrai_reranker.js";

test("uses the default model and decodes ranked results", async () => {
  const reranker = new InfraiReranker("test-key", async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), {
      query: "release risk",
      candidates: ["migration failed"],
      top_k: 1
    });
    return Response.json({
      ok: true,
      data: { ranked: [{ index: 0, score: 0.8 }] }
    });
  });

  assert.deepEqual(await reranker.rerank("release risk", ["migration failed"], 1), [
    { index: 0, relevanceScore: 0.8 }
  ]);
});
