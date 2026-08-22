import { createServer, type Server } from "node:http";

export function workerLivenessResponse(ready: boolean) {
  return ready
    ? { status: 200, body: { status: "healthy" } }
    : { status: 503, body: { status: "starting" } };
}

/** Private HTTP liveness endpoint for the App Platform worker probe. */
export function startWorkerLivenessServer(port: number, isReady: () => boolean): Server {
  const server = createServer((request, response) => {
    if (request.url !== "/healthz") {
      response.writeHead(404);
      response.end();
      return;
    }
    const result = workerLivenessResponse(isReady());
    response.writeHead(result.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(result.body));
  });
  server.listen(port, "0.0.0.0");
  return server;
}
