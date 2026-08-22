export type BotChatAvailabilityState = {
  runMode: string;
  lifeStatus: string;
  status: string;
  killSwitch: boolean;
};

/** A bot chat is available only while the same persisted controls permit its market cycle. */
export function isBotChatAvailable(bot: BotChatAvailabilityState | null | undefined) {
  return Boolean(bot && bot.runMode === "PAPER_ACTIVE" && bot.lifeStatus === "ACTIVE" && bot.status === "RUNNING" && !bot.killSwitch);
}
