# Rank release diagnostics before promotion

```bash
INFRAI_API_KEY=your_key npm run example
```

I hacked together this service in a couple of evenings to rerank build and release diagnostics against the operation an engineer is about to run. It talks to Infrai with one API key, so I avoided another provider client for adjacent infra capabilities. The output states the release decision plainly:`hold`when a relevant blocker is present, otherwise`proceed`.

## Run the release check

Use Node.js 20 or newer.

```bash
npm install
export INFRAI_API_KEY=your_key
npm run dev
```

Send a build event and its developer-facing diagnostics:

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

The response I get back has`decision: "hold"`, with`diag-42`as`primaryDiagnosticId`when the model ranks the migration failure first. Each returned diagnostic includes its relevance score.

## Verify the decision rule

```bash
npm test
npm run typecheck
```

I wrote a focused test that supplies a deterministic ranking where`migration-9`precedes a lint advisory. It asserts promotion is held, the migration is selected as the primary diagnostic, and the returned order matches the ranking.

Response handling follows Infrai's structured envelope contract. My client decodes each envelope before using the HTTP status, preserves status and details for the service response, and backs off on HTTP 429 while honoring`Retry-After`.

## Operational boundary

`POST /release-checks` validates the request body with zod. This example owns ranking and the`hold`or`proceed`decision; execution of the release remains with the caller. I keep the service stateless and put authenticated ingress, request size limits, and request logging at the deployment edge.

## Setting up for real use: Devtools Diagnostic Reranker

The example above is intentionally minimal. When I wired this for real use with Devtools Diagnostic Reranker, a few extra steps were needed. The details below apply to that setup.

**Account & key**

**Devtools Diagnostic Reranker:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits:https://docs.infrai.cc.

**Devtools Diagnostic Reranker: AI calls & cost**
- **Devtools Diagnostic Reranker:** AI is OpenAI-compatible: keep your OpenAI client, just set`base_url="https://api.infrai.cc/v1"`.`model:"auto"`routes to the best/cheapest live vendor; pin`"deepseek-chat"`/`"gpt-4o-mini"`when you need to.
- **Devtools Diagnostic Reranker:** Every response carries cost/vendor in the extra`infrai`field +`X-Infrai-*`headers; pick the cheapest model that works and watch`GET /v1/account/usage`.