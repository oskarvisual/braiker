export type AssetUniversePublicError = { code: "FORBIDDEN" | "UNAUTHENTICATED" | "INVALID_ASSET_UPDATE" | "ASSET_UNIVERSE_UNAVAILABLE"; status: number };

export function assetUniversePublicError(error: unknown): AssetUniversePublicError {
  const message = error instanceof Error ? error.message : "";
  if (message === "FORBIDDEN") return { code: "FORBIDDEN", status: 403 };
  if (message === "UNAUTHENTICATED" || message === "PASSWORD_CHANGE_REQUIRED") return { code: "UNAUTHENTICATED", status: 401 };
  if (message === "INVALID_EQUITY_SYMBOL" || message.includes("ZodError")) return { code: "INVALID_ASSET_UPDATE", status: 400 };
  return { code: "ASSET_UNIVERSE_UNAVAILABLE", status: 503 };
}

export function assetUniverseFeedback(code: string | undefined) {
  if (code === "FORBIDDEN") return "Only an Administrator can manage the global trading universe.";
  if (code === "UNAUTHENTICATED") return "Your session has ended. Sign in again and retry.";
  if (code === "INVALID_ASSET_UPDATE") return "This asset update was not valid. Reload the catalog and try again.";
  return "The global asset catalog is temporarily unavailable. Verify the database migration and restart the web service, then try again.";
}
