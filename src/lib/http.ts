export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestUrl = new URL(request.url);
  if (new URL(origin).origin !== requestUrl.origin) throw new Error("CSRF_ORIGIN_REJECTED");
}
