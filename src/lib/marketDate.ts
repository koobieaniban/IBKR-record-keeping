const ET_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** US/Eastern calendar date (YYYY-MM-DD) for a given instant, DST-aware. Used to bucket
 * fills into the trading day they belong to, regardless of the UTC offset they arrived in. */
export function easternTradingDate(date: Date): string {
  return ET_FORMATTER.format(date); // en-CA formats as YYYY-MM-DD
}
