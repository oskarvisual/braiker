import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "braiker" },
  redact: {
    paths: ["apiKey", "apiSecret", "password", "passwordHash", "authorization", "cookie", "encryptedSecret"],
    censor: "[REDACTED]"
  }
});
