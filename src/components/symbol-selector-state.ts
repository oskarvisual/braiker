export function selectedSymbolSummary(symbols: string[]) {
  return symbols.length ? symbols.join(", ") : "Choose symbols";
}
