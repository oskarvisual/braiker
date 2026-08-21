import { env } from "@/lib/env";
import { AlpacaPaperBrokerAdapter } from "@/modules/broker/alpaca-paper";

/**
 * BrAIker Personal uses one Alpaca Paper account from server-only environment
 * variables. Virtual wallets must never request or persist duplicate keys.
 */
export function globalPaperBroker() {
  const config = env();
  return new AlpacaPaperBrokerAdapter({ apiKey: config.ALPACA_API_KEY, apiSecret: config.ALPACA_API_SECRET });
}

export function globalPaperCredentials() {
  const config = env();
  return { apiKey: config.ALPACA_API_KEY, apiSecret: config.ALPACA_API_SECRET };
}

export const GLOBAL_PAPER_WALLET_ID = "00000000-0000-4000-8000-000000000001";
