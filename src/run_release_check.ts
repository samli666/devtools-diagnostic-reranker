import { InfraiReranker } from "./infrai_reranker.js";
import { decideRelease, releaseCheckSchema } from "./release_diagnostics.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the example");

const check = releaseCheckSchema.parse({
  build: {
    service: "artifact-indexer",
    revision: "8d3a21f",
    operation: "promote",
    environment: "production"
  },
  diagnostics: [
    { id: "diag-41", summary: "New compiler warnings in generated fixtures", source: "build", releaseBlocking: false },
    { id: "diag-42", summary: "Database migration compatibility check failed", source: "release", releaseBlocking: true },
    { id: "diag-43", summary: "Source map upload completed", source: "observability", releaseBlocking: false }
  ],
  limit: 3
});

const decision = await decideRelease(check, new InfraiReranker(apiKey));
console.log(JSON.stringify(decision, null, 2));
