const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateShort = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const dateWithYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * Formats an amount as US dollars with thousands separators, e.g. "$1,250.00".
 * Replaces hand-rolled `$${n.toFixed(2)}`, which drops the separators and
 * renders "-$5.00" as "$-5.00".
 */
export function formatMoney(amount: number): string {
  return currency.format(amount);
}

/** Formats an amount without the currency symbol, for use next to a label. */
export function formatAmount(amount: number): string {
  return currency.format(amount).replace("$", "");
}

/**
 * Formats a date-only string ("2026-07-27") in the reader's locale.
 *
 * Split apart by hand rather than passed to `new Date`, which reads a bare date
 * as UTC and so shows the day before for anyone west of Greenwich — on a chore
 * board, "due yesterday" and "due today" are not the same message.
 */
export function formatDay(
  iso: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, options);
}

/**
 * Formats a stored ISO timestamp as a short local date, including the year only
 * when it isn't the current one.
 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.getFullYear() === new Date().getFullYear()
    ? dateShort.format(d)
    : dateWithYear.format(d);
}
