import { validateCapsule } from "./contract";
import { transform } from "./transform";
import { record } from "./ledger";
import { machineCheck } from "./validate";
import type { Capsule } from "./types";

const PORT = parseInt(process.env.PORT ?? "3099", 10);

/**
 * Controller: capsule-to-motion-storyboard route.
 *
 * POST /capsule-to-storyboard
 *   Accepts JSON body matching the capsule contract.
 *   Returns a self-contained HTML motion storyboard.
 *
 * Public-safe: input is validated before processing;
 * output HTML escapes all user-provided strings.
 */
function handleRequest(req: Request): Response {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/health") {
    return Response.json({ status: "ok" });
  }

  if (req.method !== "POST" || url.pathname !== "/capsule-to-storyboard") {
    return Response.json(
      { error: "not found" },
      { status: 404 },
    );
  }

  return handleCapsuleRoute(req);
}

async function handleCapsuleRoute(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "invalid JSON body" },
      { status: 400 },
    );
  }

  if (!validateCapsule(body)) {
    return Response.json(
      { error: "body does not match capsule contract", schema: "https://syndash.dev/schemas/capsule-v1.json" },
      { status: 422 },
    );
  }

  const capsule = body as Capsule;

  // Machine check
  const check = machineCheck(capsule);
  if (!check.valid) {
    return Response.json(
      { error: "machine check failed", details: check.errors },
      { status: 422 },
    );
  }

  // Transform capsule → storyboard
  const output = transform(capsule);

  // Ledger retention (fire-and-forget; errors logged, don't block response)
  record(output).catch((err) =>
    console.error("[ledger] failed to record entry:", err),
  );

  return new Response(output.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline';",
      "X-Capsule-Id": output.capsuleId,
      "X-Scene-Count": String(output.sceneCount),
      "X-Total-Duration-Ms": String(output.totalDurationMs),
    },
  });
}

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`[creator-motion-storyboard] listening on http://localhost:${server.port}`);

export { handleRequest };
