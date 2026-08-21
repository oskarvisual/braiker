import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  TRADING_MODE: z.literal("paper"),
  APP_ENCRYPTION_KEY: z.string().min(43),
  SESSION_SECRET: z.string().min(32),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12),
  AI_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  ALPACA_PAPER_BASE_URL: z.literal("https://paper-api.alpaca.markets"),
  ALPACA_API_KEY: z.string().min(8),
  ALPACA_API_SECRET: z.string().min(8),
  ALPACA_DATA_FEED: z.enum(["iex", "sip"]).default("iex"),
  SMTP_HOST: z.string().trim().default(""),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM: z.string().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info")
});

export type Environment = z.infer<typeof schema>;

let cachedEnvironment: Environment | undefined;

export function env(): Environment {
  if (cachedEnvironment) return cachedEnvironment;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }
  cachedEnvironment = parsed.data;
  return cachedEnvironment;
}
