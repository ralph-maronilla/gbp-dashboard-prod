/** CSV layout for the CX Pulse upload template (HMN-GMB-CXPulse-Upload-Template.csv). */
export const CSV_HEADER = [
  "REFERENCE #",
  "DATETIME (MM/DD/YYYY H:MM)",
  "HOSPITAL CLINIC BRANCH (PREFIX)",
  "FIRST NAME",
  "MIDDLE NAME",
  "LAST NAME",
  "AGE",
  "LOCATION",
  "GENDER",
  "RATING",
  "COMMENTS",
  "REVIEWER LINK",
] as const;

/** Google reviews carry no age, gender or middle name; the template needs a value in every cell. */
export const PLACEHOLDER = "N/A";

/**
 * One CSV cell. Quoted only when needed. Text that a spreadsheet would run as a formula
 * (starts with = + - @ tab or CR) gets a leading apostrophe so reviewer-written content can't execute.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",") + "\r\n";
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
/** Lower-case surname prefixes that belong to the last name ("dela Cruz", "de la Rosa", "van Dyke"). */
const PARTICLES = new Set(["de", "del", "dela", "delos", "della", "la", "las", "los", "san", "santa", "da", "di", "van", "von", "bin", "al", "el", "mac"]);

/** "MARQUEZ" → "Marquez", but only when the whole name is upper case; "McDonald" and "de la Rosa" stay as written. */
function fixCase(name: string): string {
  if (name !== name.toUpperCase() || name === name.toLowerCase()) return name;
  return name.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** A single letter, with or without a period: "J" / "J.". */
const isInitial = (w: string) => /^\p{L}\.?$/u.test(w);

/**
 * Splits a Google display name into first / middle / last.
 * - A leading list number ("15- ", "15. ") is junk and dropped.
 * - "LAST, FIRST MIDDLE" (a comma) means surname first.
 * - Otherwise the last word is the last name, with any surname prefix before it and a trailing Jr./III;
 *   everything before it is the first name: "Mikaela Angeli D. Marquez" → "Mikaela Angeli" / "D." / "Marquez".
 * - A single-letter word at the end of the first name is the middle initial. All-caps names are title-cased.
 * Mononyms and anonymous reviewers get placeholders.
 */
export function splitName(display: string | null | undefined): { first: string; middle: string; last: string } {
  const cleaned = (display ?? "").replace(/^\s*\d+\s*[-.)]+\s*/, "").trim();
  let given: string[];
  let last: string;

  const comma = cleaned.indexOf(",");
  if (comma > 0 && comma < cleaned.length - 1) {
    last = cleaned.slice(0, comma).trim().split(/\s+/).join(" ");
    given = cleaned.slice(comma + 1).trim().split(/\s+/).filter(Boolean);
  } else {
    const parts = cleaned.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: "Anonymous", middle: PLACEHOLDER, last: PLACEHOLDER };
    if (parts.length === 1) return { first: fixCase(parts[0] as string), middle: PLACEHOLDER, last: PLACEHOLDER };
    let start = parts.length - 1;
    if (start > 1 && SUFFIXES.has((parts[start] as string).toLowerCase().replace(/\./g, ""))) start--; // "Smith Jr."
    while (start > 1 && PARTICLES.has((parts[start - 1] as string).toLowerCase())) start--; // keep at least one first-name word
    given = parts.slice(0, start);
    last = parts.slice(start).join(" ");
  }
  if (given.length === 0) return { first: fixCase(last), middle: PLACEHOLDER, last: PLACEHOLDER };

  let middle = PLACEHOLDER;
  if (given.length > 1 && isInitial(given[given.length - 1] as string)) middle = given.pop() as string;
  return { first: fixCase(given.join(" ")), middle: middle === PLACEHOLDER ? middle : fixCase(middle), last: fixCase(last) };
}

/** MM/DD/YYYY H:MM in the given time zone (hour not zero-padded, as in the template header). */
export function formatDateTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")}/${get("year")} ${Number(get("hour"))}:${get("minute")}`;
}

/** Start of the calendar day `YYYY-MM-DD` in `timeZone`, as an instant. */
export function startOfDayInZone(day: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  // Offset of the zone at that moment: format the instant in the zone and read it back as UTC.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return new Date(guess - (asUtc - guess));
}
