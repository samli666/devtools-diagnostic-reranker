import { z } from "zod";
import type { CandidateReranker } from "./infrai_reranker.js";

export const releaseCheckSchema = z.object({
  build: z.object({
    service: z.string().min(1),
    revision: z.string().min(1),
    operation: z.enum(["deploy", "promote", "rollback"]),
    environment: z.string().min(1)
  }),
  diagnostics: z.array(z.object({
    id: z.string().min(1),
    summary: z.string().min(1),
    source: z.string().min(1),
    releaseBlocking: z.boolean()
  })).min(1),
  limit: z.number().int().positive().max(20).default(5)
});

export type ReleaseCheck = z.infer<typeof releaseCheckSchema>;

export type ReleaseDecision = {
  decision: "hold" | "proceed";
  primaryDiagnosticId: string;
  rankedDiagnostics: Array<ReleaseCheck["diagnostics"][number] & { relevanceScore: number }>;
};

export async function decideRelease(
  input: ReleaseCheck,
  reranker: CandidateReranker
): Promise<ReleaseDecision> {
  const query = [
    `${input.build.operation} ${input.build.service} to ${input.build.environment}`,
    `revision ${input.build.revision}`,
    "Prioritize diagnostics that explain release risk and required operator action."
  ].join(". ");

  const candidates = input.diagnostics.map((diagnostic) =>
    `${diagnostic.releaseBlocking ? "release blocker" : "advisory"}: ${diagnostic.summary} [source: ${diagnostic.source}]`
  );
  const ranked = await reranker.rerank(query, candidates, Math.min(input.limit, candidates.length));
  const rankedDiagnostics = ranked.map((item) => ({
    ...input.diagnostics[item.index],
    relevanceScore: item.relevanceScore
  }));

  if (rankedDiagnostics.length === 0) {
    throw new Error("Reranker returned no diagnostics");
  }

  return {
    decision: rankedDiagnostics.some((diagnostic) => diagnostic.releaseBlocking) ? "hold" : "proceed",
    primaryDiagnosticId: rankedDiagnostics[0].id,
    rankedDiagnostics
  };
}
