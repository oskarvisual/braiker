/** Instant at the beginning of the current New York calendar day, including DST. */
export function newYorkMarketDayStart(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const localNoonAsUtc = new Date(Date.UTC(value("year"), value("month") - 1, value("day"), 12));
  const offsetName = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(localNoonAsUtc)
    .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const offset = offsetName.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  const offsetMinutes = offset ? (offset[1] === "+" ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3] ?? "0")) : 0;
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")) - offsetMinutes * 60_000);
}
