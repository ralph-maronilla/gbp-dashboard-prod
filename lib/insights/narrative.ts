import { CHANGE, HOTSPOT, MIN_MEASURED_REPLIES, THEME_NEGATIVE } from "@/lib/insights/signals";
import type { GroupPerformance, LocationPerformance, RecommendedAction, ThemeStat } from "@/lib/schemas/insights";

/** Plain-language summaries for the Dashboard, generated from the numbers (no AI). */

const stars = (n: number) => `${n.toFixed(1)}★`;
const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** "Dashboard readout" on the Review Overview tab. */
export function overviewReadout(locations: LocationPerformance[], withoutReviews: number, notExtracted = 0, googleView = false): string[] {
  const rated = locations.filter((l) => l.avg_rating !== null && l.reviews > 0);
  const missing =
    notExtracted > 0
      ? [
          `${plural(notExtracted, "location")} ${notExtracted === 1 ? "has" : "have"} ${googleView ? "neither extracted reviews nor Google totals" : "not been extracted"} yet, so ${notExtracted === 1 ? "its" : "their"} reviews are missing from these figures.`,
        ]
      : [];
  if (rated.length === 0) return [...missing, "No reviews in this period yet. Extract reviews or pick a longer period."];
  const top = [...rated].sort((a, b) => b.reviews - a.reviews)[0]!;
  const ratings = rated.map((l) => l.avg_rating as number);
  const out = [
    `${top.name} carries the largest review volume (${plural(top.reviews, "review")}).` +
      (rated.length > 1 ? ` Ratings vary from ${stars(Math.min(...ratings))} to ${stars(Math.max(...ratings))}` : ` Rating ${stars(ratings[0]!)}`) +
      (withoutReviews > 0 ? `, while ${plural(withoutReviews, "profile")} show${withoutReviews === 1 ? "s" : ""} no reviews.` : "."),
    ...missing,
  ];
  const priority = rated.filter((l) => l.signal.label === "Priority");
  if (priority.length > 0) out.push(`${plural(priority.length, "location")} rated below 3.0★ ${priority.length === 1 ? "needs" : "need"} priority attention: ${list(priority.slice(0, 5).map((l) => l.name))}${priority.length > 5 ? " and others" : ""}.`);
  const strong = rated.filter((l) => l.signal.label === "Strong").length;
  if (strong > 0) out.push(`${plural(strong, "location")} ${strong === 1 ? "is" : "are"} Strong (4.5★ and above).`);
  return out;
}

/** Most bullets under Monthly Highlights. */
const MAX_HIGHLIGHTS = 6;

/**
 * "Monthly highlights" on the Reputation tab: what changed since the previous period first (changeHighlights), then
 * where things stand. The unreplied 1-2★ line and the missing-grouping note are always kept.
 * `window` is the span of the Attention / Escalation counts ("in the last 30 days", "in that month").
 */
export function reputationHighlights(
  groups: GroupPerformance[],
  replyPct: number | null,
  escalations: number,
  groupWord: string,
  window = "in the last 30 days",
  changes: string[] = [],
): string[] {
  const named = groups.filter((g) => g.reviews > 0);
  if (named.length === 0) return ["No reviews in this period yet."];
  const status: string[] = [];
  if (replyPct !== null) status.push(`Owners replied to ${replyPct.toFixed(0)}% of reviews in this period.`);
  const slow = named.filter((g) => g.response.label !== "On Track").map((g) => g.group);
  if (slow.length > 0) status.push(`Response coverage in ${list(slow)} is on the watchlist.`);
  const hot = named.filter((g) => g.attention.label === "High").map((g) => g.group);
  if (hot.length > 0) status.push(`Many low ratings ${window} in ${list(hot)}; review the cases for resolution.`);
  const best = [...named].filter((g) => g.avg_rating !== null).sort((a, b) => (b.avg_rating as number) - (a.avg_rating as number))[0];
  if (best && named.length > 1) status.push(`${best.group} leads the network at ${stars(best.avg_rating as number)}.`);
  const kept = [
    escalations > 0
      ? `${plural(escalations, "review")} rated 1-2★ ${window} still ${escalations === 1 ? "has" : "have"} no reply.`
      : `Every review rated 1-2★ ${window} has a reply.`,
  ];
  if (groups.some((g) => g.group === "Unassigned")) kept.push(`Some locations have no ${groupWord} yet; set it in Extraction → Edit location.`);
  return [...[...changes, ...status].slice(0, MAX_HIGHLIGHTS - kept.length), ...kept];
}

/** One period's figures for a group or the whole network (changeHighlights). */
export interface PeriodFigures {
  reviews: number;
  rating: number | null;
  replyPct: number | null;
  /** Measured replies and their median days to reply (lib/data/insights.ts responseSpeedCard). */
  measured: number;
  medianDays: number | null;
  /** Reviews with text, and how many of them are Positive Commendations mentions. */
  textReviews: number;
  commendations: number;
}
export interface PeriodComparison {
  /** How the previous period is named in the sentences: "the month before", "the previous 3 months". */
  previous: string;
  network: { cur: PeriodFigures; prev: PeriodFigures };
  groups: { group: string; cur: PeriodFigures; prev: PeriodFigures }[];
  /** Issue themes only. */
  themes: { label: string; cur: { mentions: number; negativePct: number | null }; prev: { mentions: number; negativePct: number | null } }[];
}

const MAX_CHANGES = 4;
/** "in A, B and C", "in A, B, C and 3 more", or "across all 7 groups" / "across most groups (6 of 7)" when nearly all moved. */
function where(names: string[], compared: number): string {
  if (names.length >= 4 && names.length === compared) return `across all ${compared} groups`;
  if (names.length >= 4 && names.length >= compared * 0.75) return `across most groups (${names.length} of ${compared})`;
  return `in ${names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : list(names)}`;
}
/** At most 3 names: "A, B and C", "A, B, C and 2 more". */
const few = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : list(names));
const pts = (n: number) => `${n.toFixed(0)}%`;
const days = (n: number) => `${n.toFixed(0)} day${Math.round(n) === 1 ? "" : "s"}`;

/**
 * What changed since the previous period, in plain sentences, as in the sample's "Response quality improved across most
 * metro locations". Rates only (the current period may still be running, so counts are not comparable), and only
 * changes of at least CHANGE in groups / themes with enough reviews in both periods. Empty when there is nothing to
 * compare (no reviews before); "No significant change" when nothing moved enough.
 */
export function changeHighlights(cmp: PeriodComparison): string[] {
  const { network, previous } = cmp;
  if (network.prev.reviews === 0 || network.cur.reviews === 0) return [];
  const out: string[] = [];
  const eligible = cmp.groups.filter((g) => g.cur.reviews >= CHANGE.MIN_GROUP_REVIEWS && g.prev.reviews >= CHANGE.MIN_GROUP_REVIEWS);
  const moved = (f: (x: PeriodFigures) => number | null, min: number) => {
    const d = eligible
      .map((g) => ({ g, a: f(g.prev), b: f(g.cur) }))
      .flatMap((x) => (x.a === null || x.b === null ? [] : [{ ...x, a: x.a, b: x.b, d: x.b - x.a }]))
      .filter((x) => Math.abs(x.d) >= min);
    return { up: d.filter((x) => x.d > 0).sort((p, q) => q.d - p.d), down: d.filter((x) => x.d < 0).sort((p, q) => p.d - q.d) };
  };

  // Rating: the network, then the groups that moved most.
  const r = moved((x) => x.rating, CHANGE.GROUP_STARS);
  const [a, b] = [network.prev.rating, network.cur.rating];
  const parts: string[] = [];
  if (a !== null && b !== null && Math.abs(b - a) >= CHANGE.NETWORK_STARS)
    parts.push(`Average rating ${b > a ? "rose" : "fell"} from ${a.toFixed(2)}★ to ${b.toFixed(2)}★ compared with ${previous}`);
  if (r.up.length > 0) parts.push(`${parts.length ? "improved" : "Ratings improved"} in ${few(r.up.map((x) => `${x.g.group} (${stars(x.a)} → ${stars(x.b)})`))}`);
  if (r.down.length > 0) parts.push(`${parts.length ? "dropped" : "Ratings dropped"} in ${few(r.down.map((x) => `${x.g.group} (${stars(x.a)} → ${stars(x.b)})`))}`);
  if (parts.length > 0) out.push(`${parts.join("; ")}.`);

  // Themes across the network: negative share up or down.
  const themes = cmp.themes
    .filter((t) => t.cur.mentions >= CHANGE.MIN_THEME_MENTIONS && t.prev.mentions >= CHANGE.MIN_THEME_MENTIONS && t.cur.negativePct !== null && t.prev.negativePct !== null)
    .map((t) => ({ t, a: t.prev.negativePct as number, b: t.cur.negativePct as number, d: (t.cur.negativePct as number) - (t.prev.negativePct as number) }));
  const worse = themes.filter((x) => x.d >= CHANGE.THEME_POINTS).sort((p, q) => q.d - p.d);
  const better = themes.filter((x) => x.d <= -CHANGE.THEME_POINTS).sort((p, q) => p.d - q.d);
  if (worse.length > 0)
    out.push(`Complaints about ${few(worse.map((x) => x.t.label))} rose (${worse[0]!.t.label} ${pts(worse[0]!.a)} → ${pts(worse[0]!.b)} negative); escalate for resolution.`);
  if (better.length > 0) out.push(`Complaints about ${few(better.map((x) => x.t.label))} eased (${better[0]!.t.label} ${pts(better[0]!.a)} → ${pts(better[0]!.b)} negative).`);

  // Response coverage by group.
  const rep = moved((x) => x.replyPct, CHANGE.REPLY_POINTS);
  if (rep.up.length > 0) out.push(`Response coverage improved ${where(rep.up.map((x) => x.g.group), eligible.length)}.`);
  if (rep.down.length > 0) out.push(`Response coverage fell ${rep.down.length >= 4 ? where(rep.down.map((x) => x.g.group), eligible.length) : `in ${list(rep.down.map((x) => `${x.g.group} (${pts(x.a)} → ${pts(x.b)})`))}`} and is on the watchlist.`);

  // Commendations: share of reviews with text that praise or thank, by group.
  const com = moved((x) => (x.textReviews >= CHANGE.MIN_GROUP_REVIEWS ? (x.commendations / x.textReviews) * 100 : null), CHANGE.COMMEND_POINTS);
  if (com.up.length > 0) out.push(`Positive commendations increased ${where(com.up.map((x) => x.g.group), eligible.length)}.`);
  if (com.down.length > 0) out.push(`Positive commendations fell ${where(com.down.map((x) => x.g.group), eligible.length)}.`);

  // Reply speed, only with enough measured replies in both periods.
  const spd = moved((x) => (x.measured >= MIN_MEASURED_REPLIES ? x.medianDays : null), CHANGE.SPEED_DAYS);
  if (spd.up.length > 0) out.push(`Replies got slower in ${few(spd.up.map((x) => `${x.g.group} (median ${days(x.a)} → ${days(x.b)})`))}.`);
  if (spd.down.length > 0) out.push(`Replies got faster in ${few(spd.down.map((x) => `${x.g.group} (median ${days(x.a)} → ${days(x.b)})`))}.`);

  return out.length > 0 ? out.slice(0, MAX_CHANGES) : [`No significant change from ${previous}.`];
}

/** "Management insight" on the Review Intelligence tab. */
export function managementInsight(themes: ThemeStat[]): string {
  const issues = themes.filter((t) => t.kind === "issue" && t.mentions > 0);
  if (issues.length === 0) return "Not enough review text in this period to identify themes.";
  const priority = issues.filter((t) => t.signal.label === "Priority").map((t) => t.label);
  const watch = issues.filter((t) => t.signal.label === "Watch").map((t) => t.label);
  const strengths = issues.filter((t) => t.signal.label === "Strength").map((t) => t.label);
  const parts: string[] = [];
  if (priority.length > 0) parts.push(`${list(priority)} ${priority.length === 1 ? "draws" : "draw"} the most negative feedback and ${priority.length === 1 ? "needs" : "need"} focused intervention`);
  if (watch.length > 0) parts.push(`${list(watch)} ${watch.length === 1 ? "is" : "are"} worth watching`);
  if (strengths.length > 0) parts.push(`${list(strengths)} ${strengths.length === 1 ? "is a strength" : "are strengths"} to build on`);
  return `Recurring themes across locations reveal operational patterns: ${parts.join("; ")}.`;
}

/** A location's mentions of one theme, and how many of them are negative. */
export interface Hotspot {
  id: string;
  name: string;
  mentions: number;
  negative: number;
}

const negativePct = (h: Hotspot) => (100 * h.negative) / h.mentions;

/**
 * Locations to name for a flagged theme: enough mentions, more negative than the theme overall and than the Watch line,
 * worst first.
 */
export function hotspotsOf(places: Hotspot[], overallNegativePct: number): Hotspot[] {
  return places
    .filter((h) => h.mentions >= HOTSPOT.MIN_MENTIONS && negativePct(h) >= THEME_NEGATIVE.WATCH && negativePct(h) > overallNegativePct)
    .sort((a, b) => negativePct(b) - negativePct(a) || b.mentions - a.mentions || a.name.localeCompare(b.name));
}

/**
 * "Recommended actions" on the Review Intelligence tab: each flagged theme's standard advice and where it is worst.
 * `themes` arrive most urgent first.
 */
export function recommendedActions(themes: { label: string; action: string; hotspots: Hotspot[] }[]): RecommendedAction[] {
  return themes.map((t) => ({
    theme: t.label,
    advice: t.action,
    most_affected: t.hotspots.slice(0, HOTSPOT.MAX_SHOWN).map((h) => ({ location_id: h.id, location: h.name, mentions: h.mentions, negative_pct: Math.round(negativePct(h)) })),
    more: Math.max(0, t.hotspots.length - HOTSPOT.MAX_SHOWN),
  }));
}
