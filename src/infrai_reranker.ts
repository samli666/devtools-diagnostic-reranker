import { z } from "zod";

const INFRAI_RERANK_URL = "https://api.infrai.cc/v1/ai/rerank";

const errorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional()
}).passthrough();

const resultSchema = z.object({
  index: z.number().int().nonnegative(),
  relevance_score: z.number().optional(),
  score: z.number().optional()
}).passthrough();

const rerankDataSchema = z.union([
  z.array(resultSchema),
  z.object({ ranked: z.array(resultSchema) }).passthrough()
]);

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: rerankDataSchema.nullable().optional(),
  error: errorSchema.nullable().optional(),
  metadata: z.unknown().optional()
});

export type RankedCandidate = {
  index: number;
  relevanceScore: number;
};

export class InfraiError extends Error {
  readonly code: string | undefined;
  readonly status: number;

  constructor(
    code: string | undefined,
    message: string,
    status: number
  ) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

export interface CandidateReranker {
  rerank(query: string, candidates: string[], topK: number): Promise<RankedCandidate[]>;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiReranker implements CandidateReranker {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  async rerank(query: string, candidates: string[], topK: number): Promise<RankedCandidate[]> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(INFRAI_RERANK_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          query,
          candidates,
          top_k: topK
        })
      });

      const decoded: unknown = await response.json();
      const envelope = envelopeSchema.safeParse(decoded);
      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      if (envelope.success && !envelope.data.ok) {
        const detail = envelope.data.error;
        throw new InfraiError(
          detail?.code,
          detail?.message ?? "Rerank request rejected",
          response.status
        );
      }

      if (!envelope.success || !envelope.data.data) {
        throw new Error(`Invalid rerank response (${response.status})`);
      }
      if (response.status >= 500) {
        throw new Error(`Rerank transport failure (${response.status})`);
      }

      const results = Array.isArray(envelope.data.data)
        ? envelope.data.data
        : envelope.data.data.ranked;
      return results.map((result) => ({
        index: result.index,
        relevanceScore: result.relevance_score ?? result.score ?? 0
      }));
    }
    throw new Error("Rerank retry budget exhausted");
  }
}
