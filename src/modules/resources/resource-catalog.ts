import type { ResourceCategory } from "./resource-policy";

export type DefaultResourceSource = { category: ResourceCategory; name: string; url: string; hostname: string; autoActivate: boolean; refreshMinutes: number };

/** Public URL registry. Editorial and paywalled sites are visible but remain inactive. */
export const defaultResourceSources: readonly DefaultResourceSource[] = [
  { category: "MACRO", name: "Federal Reserve", url: "https://www.federalreserve.gov/", hostname: "www.federalreserve.gov", autoActivate: true, refreshMinutes: 1440 },
  { category: "MACRO", name: "Bureau of Labor Statistics", url: "https://www.bls.gov/", hostname: "www.bls.gov", autoActivate: true, refreshMinutes: 1440 },
  { category: "MACRO", name: "Bureau of Economic Analysis", url: "https://www.bea.gov/", hostname: "www.bea.gov", autoActivate: true, refreshMinutes: 1440 },
  { category: "NEWS", name: "Reuters Markets", url: "https://www.reuters.com/markets/", hostname: "www.reuters.com", autoActivate: false, refreshMinutes: 1440 },
  { category: "FILINGS", name: "SEC EDGAR", url: "https://www.sec.gov/edgar/search/", hostname: "www.sec.gov", autoActivate: true, refreshMinutes: 1440 },
  { category: "EARNINGS", name: "Nasdaq Earnings", url: "https://www.nasdaq.com/market-activity/earnings", hostname: "www.nasdaq.com", autoActivate: false, refreshMinutes: 1440 },
  { category: "SENTIMENT", name: "Cboe", url: "https://www.cboe.com/", hostname: "www.cboe.com", autoActivate: true, refreshMinutes: 1440 },
  { category: "SENTIMENT", name: "FINRA", url: "https://www.finra.org/", hostname: "www.finra.org", autoActivate: true, refreshMinutes: 1440 },
  { category: "ETF_ROTATION", name: "ETF.com", url: "https://www.etf.com/", hostname: "www.etf.com", autoActivate: false, refreshMinutes: 1440 },
  { category: "TECHNICAL", name: "Alpaca Market Data", url: "https://alpaca.markets/data", hostname: "alpaca.markets", autoActivate: true, refreshMinutes: 1440 },
];
