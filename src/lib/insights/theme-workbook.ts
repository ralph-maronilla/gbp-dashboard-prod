/**
 * Review Intelligence Excel export: a Summary tab (each location × theme, as the heatmap judges it) and one tab per
 * location with one row per review per theme it mentions. Pure: lib/data/theme-export.ts loads and classifies the
 * reviews, lib/export/xlsx.ts writes the file.
 */
import type { Sentiment, ThemeSentiment } from "./sentiment";
import { commendationSignal, issueLevel } from "./signals";
import { THEMES, type ThemeDef, type ThemeKey } from "./themes";
import { themeMarks } from "./theme-reviews";
import { safeSheetName, type Cell, type Sheet } from "@/lib/export/xlsx";
import type { ThemeSentimentFilter } from "@/lib/schemas/insights";

export interface WorkbookReview {
  reference_no: number;
  /** Already formatted in Manila time. */
  date: string;
  rating: number;
  location_id: string;
  location: string;
  region: string | null;
  type: string | null;
  replied: boolean;
  reviewer_url: string | null;
  comment: string;
  /** classifyCached() result: the themes the review mentions and how. */
  found: Map<ThemeKey, ThemeSentiment>;
}

const SENTIMENT: Record<Sentiment, string> = { positive: "Positive", mixed: "Mixed", negative: "Negative" };
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

const LOCATION_HEADER = ["Ref No", "Date (Manila)", "Stars", "Theme", "Sentiment", "Judged from", "Replied", "Matched words", "Review", "Reviewer link"];
const LOCATION_WIDTHS = [9, 17, 7, 22, 11, 12, 9, 22, 80, 40];
const SUMMARY_HEADER = ["Location", "Region", "Type", "Theme", "Mentions", "Positive %", "Mixed %", "Negative %", "Level"];

interface Tally {
  mentions: number;
  positive: number;
  mixed: number;
  negative: number;
}
const empty = (): Tally => ({ mentions: 0, positive: 0, mixed: 0, negative: 0 });

function summaryRow(location: string, region: string | null, type: string | null, theme: ThemeDef, t: Tally): Cell[] {
  const pos = pct(t.positive, t.mentions);
  const neg = pct(t.negative, t.mentions);
  const level = theme.kind === "commendation" ? commendationSignal(pos) : issueLevel(neg);
  return [location, region ?? "", type ?? "", theme.label, t.mentions, pos, pct(t.mixed, t.mentions), neg, level.label];
}

/** Short tab name: the location without the "Healthway" prefix. */
export const tabName = (location: string) => location.replace(/^Healthway\s*-?\s*/i, "") || location;

/**
 * The workbook's sheets. `reviews` newest first. `theme` / `sentiment` / `q` narrow it as the theme panel does; the
 * Summary counts every mention that passes `theme` and `q` (so its totals equal the tiles), the location tabs only the
 * ones that also pass `sentiment`.
 */
export function themeWorkbook(
  reviews: WorkbookReview[],
  opts: { theme?: ThemeKey; sentiment: ThemeSentimentFilter; q?: string; about: string[] },
): Sheet[] {
  const themes = opts.theme ? THEMES.filter((t) => t.key === opts.theme) : THEMES;
  const q = opts.q?.toLowerCase();
  const network = new Map<ThemeKey, Tally>(themes.map((t) => [t.key, empty()]));
  type Loc = { name: string; region: string | null; type: string | null; tallies: Map<ThemeKey, Tally>; rows: { order: number; cells: Cell[] }[] };
  const byLocation = new Map<string, Loc>();

  for (const r of reviews) {
    if (q && !r.comment.toLowerCase().includes(q)) continue;
    themes.forEach((theme, order) => {
      const f = r.found.get(theme.key);
      if (!f) return;
      const loc: Loc = byLocation.get(r.location_id) ?? { name: r.location, region: r.region, type: r.type, tallies: new Map(), rows: [] };
      byLocation.set(r.location_id, loc);
      const local = loc.tallies.get(theme.key) ?? empty();
      loc.tallies.set(theme.key, local);
      for (const t of [network.get(theme.key)!, local]) {
        t.mentions++;
        t[f.sentiment]++;
      }
      if (opts.sentiment !== "all" && opts.sentiment !== f.sentiment) return;
      const words = [...new Set(themeMarks(theme, r.comment).map(([a, b]) => r.comment.slice(a, b).toLowerCase()))].join("; ");
      loc.rows.push({
        order,
        cells: [r.reference_no, r.date, r.rating, theme.label, SENTIMENT[f.sentiment], f.fromText ? "Words" : "Stars", r.replied ? "Yes" : "No", words, r.comment, r.reviewer_url ?? ""],
      });
    });
  }

  // Worst first, like the panel: most negative mentions (positive ones when only Positive Commendations is exported).
  const key = themes.length === 1 && themes[0]!.kind === "commendation" ? "positive" : "negative";
  const score = (l: { tallies: Map<ThemeKey, Tally> }) =>
    [...l.tallies].reduce((a, [k, t]) => a + (key === "positive" || THEMES.find((x) => x.key === k)!.kind === "issue" ? t[key] : 0), 0);
  const locations = [...byLocation.values()].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));

  const summary: Cell[][] = [["Review Intelligence export"], ...opts.about.map((line) => [line]), []];
  const headerRow = summary.length;
  summary.push(SUMMARY_HEADER);
  for (const theme of themes) summary.push(summaryRow("All locations", null, null, theme, network.get(theme.key)!));
  for (const l of locations) for (const theme of themes) {
    const t = l.tallies.get(theme.key);
    if (t) summary.push(summaryRow(l.name, l.region, l.type, theme, t));
  }
  if (locations.length === 0) summary.push([], ["No reviews match these filters."]);

  const taken = new Set<string>();
  const sheets: Sheet[] = [
    { name: safeSheetName("Summary", taken), rows: summary, headerRow, boldRows: [0], widths: [40, 22, 18, 24, 10, 11, 9, 11, 11] },
  ];
  for (const l of locations) {
    if (l.rows.length === 0) continue;
    const rows = l.rows.map((r, i) => ({ ...r, i })).sort((a, b) => a.order - b.order || a.i - b.i).map((r) => r.cells);
    sheets.push({ name: safeSheetName(tabName(l.name), taken), rows: [LOCATION_HEADER, ...rows], headerRow: 0, widths: LOCATION_WIDTHS, wrapCols: [8] });
  }
  return sheets;
}
