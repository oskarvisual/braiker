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
  OPENAI_API_KEY: z.string().trim().default(""),
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-5.4-mini"),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(8_000),
  AI_MAX_ANALYSES_PER_BOT_PER_DAY: z.coerce.number().int().min(1).max(100).default(10),
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
  METRICS_TOKEN: z.string().refine((value) => value === "" || value.length >= 32).default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info")
}).superRefine((value, context) => {
  if (value.AI_ENABLED && value.OPENAI_API_KEY.length < 20) context.addIssue({ code: z.ZodIssueCode.custom, path: ["OPENAI_API_KEY"], message: "required when AI_ENABLED=true" });
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
