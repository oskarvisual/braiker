function parseOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const configuredPublicOrigin = process.env.APP_ORIGIN?.trim();
  const expectedOrigin = configuredPublicOrigin
    ? parseOrigin(configuredPublicOrigin)
    : parseOrigin(request.url);
  const requestOrigin = parseOrigin(origin);

  if (!expectedOrigin || !requestOrigin || requestOrigin !== expectedOrigin) {
    throw new Error("CSRF_ORIGIN_REJECTED");
  }
}
