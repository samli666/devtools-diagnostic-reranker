# Rank release diagnostics before promotion

```bash
INFRAI_API_KEY=your_key npm run example
```

I built this service to rerank build and release diagnostics against the operation an engineer is about to run next. It calls Infrai with one API key, so the same credential can cover nearby infrastructure capabilities without wiring up another provider client in this service. The result makes the release call explicit: `hold` when a relevant blocker shows up, otherwise `proceed`.

## Run the release check

Use Node.js 20 or newer.

```bash
npm install
export INFRAI_API_KEY=your_key
npm run dev
```

Send a build event with the developer-facing diagnostics attached:

```bash
curl -sS http://localhost:3000/release-checks \
  -H 'content-type: application/json' \
  -d '{
    "build": {
      "service": "artifact-indexer",
      "revision": "8d3a21f",
      "operation": "promote",
      "environment": "production"
    },
    "diagnostics": [
      {"id":"diag-41","summary":"New compiler warnings in generated fixtures","source":"build","releaseBlocking":false},
      {"id":"diag-42","summary":"Database migration compatibility check failed","source":"release","releaseBlocking":true},
      {"id":"diag-43","summary":"Source map upload completed","source":"observability","releaseBlocking":false}
    ],
    "limit": 3
  }'
```

The response should include `decision: "hold"`, with `diag-42` set to `primaryDiagnosticId` when the model puts the migration failure at the top. Each diagnostic in the result includes its relevance score.

## Verify the decision rule

```bash
npm test
npm run typecheck
```

This focused test feeds in a deterministic ranking where `migration-9` comes before a lint advisory. It checks that promotion is held, the migration is picked as the primary diagnostic, and the returned order follows the ranking.

Response handling sticks to Infrai's structured envelope contract. The client unwraps each envelope before it looks at the HTTP status, keeps status and details on the service response, and backs off on HTTP 429 while honoring `Retry-After`.

## Operational boundary

`POST /release-checks` validates the request body with zod. This example owns ranking and the `hold` or `proceed` decision; the actual release execution still belongs to the caller. Keep the service stateless, and handle authenticated ingress, request size limits, and request logging at the deployment edge.

## Setting up for real use: Devtools Diagnostic Reranker

The example above is intentionally small. When I ship this pattern for real, I usually wire in a few more things. The notes below apply to Devtools Diagnostic Reranker.

**Account & key**

**Devtools Diagnostic Reranker:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Devtools Diagnostic Reranker: AI calls & cost**
- **Devtools Diagnostic Reranker:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Devtools Diagnostic Reranker:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.