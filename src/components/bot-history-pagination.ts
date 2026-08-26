export type BotHistoryTab = "operations" | "analysis" | "adaptive" | "assets" | "chats";

export type BotHistoryPageAvailability = {
  orders: boolean;
  scans: boolean;
  adjustments: boolean;
  operatingCosts: boolean;
};

export function hasOlderHistoryForTab(tab: BotHistoryTab, availability: BotHistoryPageAvailability) {
  if (tab === "operations") return availability.orders;
  if (tab === "analysis") return availability.scans || availability.operatingCosts;
  if (tab === "adaptive") return availability.adjustments;
  return false;
}
