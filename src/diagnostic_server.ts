import { createServer } from "node:http";
import { InfraiError, InfraiReranker } from "./infrai_reranker.js";
import { decideRelease, releaseCheckSchema } from "./release_diagnostics.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const reranker = new InfraiReranker(apiKey);
const port = Number(process.env.PORT ?? 3000);

function send(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/release-checks") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const parsed = releaseCheckSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) {
      send(response, 400, { error: "Invalid release check", details: parsed.error.flatten() });
      return;
    }
    send(response, 200, await decideRelease(parsed.data, reranker));
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.message, ...(error.code ? { code: error.code } : {}) });
      return;
    }
    send(response, 502, { error: "Unable to rank release diagnostics" });
  }
});

server.listen(port, () => {
  console.log(`Release diagnostic service listening on http://localhost:${port}`);
});
