import assert from "node:assert/strict";
import test from "node:test";
import type { CandidateReranker } from "../src/infrai_reranker.js";
import { decideRelease, releaseCheckSchema } from "../src/release_diagnostics.js";

test("holds promotion when the ranked diagnostics contain a release blocker", async () => {
  const deterministicReranker: CandidateReranker = {
    async rerank() {
      return [
        { index: 1, relevanceScore: 0.97 },
        { index: 0, relevanceScore: 0.31 }
      ];
    }
  };
  const input = releaseCheckSchema.parse({
    build: { service: "package-registry", revision: "a91e2c0", operation: "promote", environment: "production" },
    diagnostics: [
      { id: "lint-7", summary: "Deprecated test matcher", source: "build", releaseBlocking: false },
      { id: "migration-9", summary: "Migration compatibility check failed", source: "release", releaseBlocking: true }
    ],
    limit: 2
  });

  const result = await decideRelease(input, deterministicReranker);

  assert.equal(result.decision, "hold");
  assert.equal(result.primaryDiagnosticId, "migration-9");
  assert.deepEqual(result.rankedDiagnostics.map((item) => item.id), ["migration-9", "lint-7"]);
});
