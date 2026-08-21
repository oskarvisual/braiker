type BotControlFeedbackContext = {
  requestedBotName: string;
  walletName?: string;
  availableCapital?: string;
};

export type BotControlFeedback = {
  title: string;
  message: string;
};

export function botControlFeedback(code: string | undefined, context: BotControlFeedbackContext): BotControlFeedback {
  if (code === "INSUFFICIENT_UNALLOCATED_CAPITAL") {
    const walletName = context.walletName ?? "This wallet";
    const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(context.availableCapital ?? "0"));
    return {
      title: "No capital available",
      message: `${walletName} has ${amount} available. Turn off and delete an unused bot to return its budget, or add another wallet in Settings.`
    };
  }
  if (code === "BOT_RISK_HALTED") return { title: `${context.requestedBotName} cannot be turned on`, message: "This bot is halted by risk controls. Review it before trying again." };
  if (code === "BOT_ERROR") return { title: `${context.requestedBotName} cannot be turned on`, message: "This bot has a dependency error. Resolve it before trying again." };
  if (code === "BOT_MAINTENANCE") return { title: `${context.requestedBotName} cannot be turned on`, message: "This bot is under maintenance. Try again when maintenance is complete." };
  if (code === "BOT_DEAD") return { title: `${context.requestedBotName} is no longer available`, message: "A dead bot cannot be restarted. Its history is retained permanently." };
  return { title: "We could not update this bot", message: "Please try again. If the problem continues, review the bot configuration." };
}
