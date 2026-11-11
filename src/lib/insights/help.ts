/**
 * Plain-language explanations behind the Dashboard's ⓘ tooltips, written for readers with no technical background
 * (same wording as data/Review Dashboard Guide.docx). Thresholds come from ./signals, so the text always matches the
 * colours on screen. Edit the wording here; components only look entries up.
 */
import {
  ACTIVITY,
  CHANGE,
  ATTENTION,
  COMMENDATION,
  COMPARE,
  MIN_DRIVER_MENTIONS,
  MIN_MEASURED_REPLIES,
  MIN_MEASURED_SPAN_DAYS,
  RATING,
  REPLY,
  SPEED_DAYS,
  THEME_NEGATIVE,
} from "./signals";
import type { ThemeKey } from "./themes";

const R = RATING;
const C = CHANGE;
const T = THEME_NEGATIVE;
/** Rating bands in words, exactly as the signals judge them (also the caption under Location Performance). */
export const ratingRule = `Strong ${R.STRONG}★ and up, Stable ${R.STABLE.toFixed(1)}–${(R.STRONG - 0.01).toFixed(2)}★, Watch ${R.WATCH.toFixed(1)}–${(R.STABLE - 0.01).toFixed(2)}★, Priority below ${R.WATCH.toFixed(1)}★.`;
const sentimentRule =
  "The feeling is read from the words around each topic in the review (English, Tagalog and Bisaya): praise words count as positive, complaint words as negative, and 'not', 'hindi' or 'wala' flip them. A topic with both is mixed. When the review says nothing good or bad about that topic, its stars decide (4–5★ positive, 3★ mixed, 1–2★ negative).";
const themeRule = `Strength when fewer than ${T.WATCH}% of its mentions are negative, Watch from ${T.WATCH}% to ${T.PRIORITY - 1}%, Priority at ${T.PRIORITY}% or more.`;
const commendationRule = `Strength when ${COMMENDATION.STRENGTH}% or more of its mentions are positive, Stable from ${COMMENDATION.STABLE}%, Watch below that.`;
const AREA_HELP =
  "Area splits Metro Manila into Metro North (Quezon City, Caloocan, Valenzuela, Malabon, Navotas and the City of Manila), Metro East (Pasig, Mandaluyong, San Juan, Marikina) and Metro South (Makati, Taguig, Pasay, Parañaque, Las Piñas, Muntinlupa), using the city in the address; outside Metro Manila it groups regions into North, Central and South Luzon, Visayas and Mindanao.";
const SEGMENT_HELP =
  "Segment groups locations by their Type: hospitals in Metro Manila (Metro Hospitals) or elsewhere (Provincial Hospitals), outpatient centers (Outpatient Centers), and specialty or diagnostic centers (Specialty Centers).";
const perBucket = (per: string) => (per === "month" ? "each month" : per === "quarter" ? "each quarter (3 months)" : "each year");

/** Overview tab: the five figures at the top. Google totals and extracted reviews mean different things. */
export function overviewKpiHelp(source: "google" | "extracted") {
  const google = source === "google";
  return {
    profiles: "The number of Google Business Profiles (locations) included by your filters.",
    with_reviews: google
      ? "Locations whose Google profile shows at least one review."
      : "Locations that received at least one review in the selected period.",
    total_reviews: google
      ? "All reviews Google shows for these locations, as of the last Refresh Google totals. Includes star-only reviews with no text. The period filter does not change this number."
      : "Reviews this app has collected for the selected period and filters.",
    weighted_rating: `The average star rating across all locations, where busier locations count more: a location with 600 reviews affects it more than one with 20. ${ratingRule}`,
    without_reviews: google
      ? "Locations whose Google profile has no reviews yet."
      : "Locations with no reviews in the selected period (or not extracted yet). These are worth a closer look.",
  };
}

export const HELP = {
  // Overview tab
  locationPerformance: `Each location's star rating and number of reviews, with a colour signal for its rating. ${ratingRule} Click a column title to sort; click a location to open it.`,
  locationRating: "The location's average star rating (1 to 5).",
  locationSignal: `How healthy the rating is. ${ratingRule}`,
  largestVolumes: "The five locations with the most reviews. More reviews usually means more patients and a more reliable rating.",
  readout: "A short written summary of the figures above, generated automatically from the same numbers.",

  // Reputation tab: status tiles
  coverage: "How many locations received reviews in this period. Full Portfolio means every location did; Partial means some had none, or have not been extracted yet.",
  ratingHealth: `The average star rating of all reviews in this period. ${ratingRule}`,
  responseCoverage: `The share of reviews that have a reply from the business. High at ${REPLY.GOOD}% or more, Moderate from ${REPLY.FAIR}%, Low below that.`,
  responseSpeed: `How many days it usually takes to reply to a review (the middle value, so a few very late replies do not distort it). On Track within ${SPEED_DAYS.ON_TRACK} days, Needs Attention within ${SPEED_DAYS.NEEDS_ATTENTION}, Slow after that. "Measured" means the app saw the reply appear itself (accurate to about a day); "approx." means it is estimated from Google's "3 weeks ago" style dates, until at least ${MIN_MEASURED_REPLIES} replies have been measured over at least ${MIN_MEASURED_SPAN_DAYS} days.`,
  escalation: "Unhappy reviews (1–2★) from the last 30 days (with Last month: from that month) that still have no reply. Clear means there are none; Active Monitoring means some are waiting for a reply.",

  // Reputation tab: group table and charts
  groupPerformance: `The same health checks for each group of locations. Use the switch on the right to change the grouping. ${AREA_HELP} Locations without a region (or type, for Segment and Type) appear as Unassigned.`,
  colHealth: `The group's average star rating. ${ratingRule}`,
  colActivity: `How many reviews each location gets per month, based on the last 90 days (with Last month: that month). High at ${ACTIVITY.HIGH} or more, Moderate from ${ACTIVITY.MODERATE}, Low below that.`,
  colResponse: `The share of reviews with a reply from the business. On Track at ${REPLY.GOOD}% or more, Needs Attention from ${REPLY.FAIR}%, Off Track below that.`,
  colAttention: `The share of reviews in the last 30 days (with Last month: in that month) that are 1–2★. High above ${ATTENTION.HIGH}%, Watch from ${ATTENTION.WATCH}%, Low below that.`,
  highlights:
    `The most important points from this tab, written automatically. First, what changed compared with the period before (Last month against the month before, Last 3 months against the 3 months before, and so on): the average rating, ratings by group, complaints by topic, reply coverage, commendations and reply speed. Small changes are left out: less than ${C.NETWORK_STARS}★ for the network, ${C.GROUP_STARS}★ for a group, ${C.REPLY_POINTS} points of reply coverage, ${C.THEME_POINTS} points of complaints about a topic, ${C.COMMEND_POINTS} points of commendations or ${C.SPEED_DAYS} day of reply speed, and groups with fewer than ${C.MIN_GROUP_REVIEWS} reviews or topics with fewer than ${C.MIN_THEME_MENTIONS} mentions in either period. Then where things stand: reply rate, groups to watch and unanswered complaints. All time has nothing to compare with, so it shows only the second part.`,
  volumeChart: (per: string) => `How many new reviews came in ${perBucket(per)}. Rising bars mean more patients are leaving reviews. Long periods switch to quarters or years automatically; use the switch above to change it.`,
  ratingChart: (per: string) => `The average star rating of the reviews written in ${perBucket(per)}. A line going down means recent patients are less satisfied.`,
  lowChart: (per: string) => `How many 1–2★ (unhappy) reviews came in ${perBucket(per)}. A spike points to a problem worth checking in that period.`,
  latestLow: "The newest 1–2★ reviews, so you can read exactly what unhappy patients said and follow up.",

  // Sentiment tab
  headlinePositive: `The topic patients feel best about: the theme with the highest share of positive mentions (only themes with at least ${MIN_DRIVER_MENTIONS} mentions).`,
  headlineMixed: `The topic with the most mixed feelings: the theme with the highest share of mixed mentions (only themes with at least ${MIN_DRIVER_MENTIONS} mentions).`,
  headlineNegative: `The topic patients complain about most: the theme with the highest share of negative mentions (only themes with at least ${MIN_DRIVER_MENTIONS} mentions).`,
  sentimentTable: `For each topic (theme) patients write about, how the reviews that mention it feel. ${sentimentRule} Topics are found by keywords in English and Tagalog, and one review can mention several topics.`,
  colPositive: "Share of this theme's mentions where the review speaks well of it.",
  colMixed: "Share of this theme's mentions where the review says both good and bad things about it.",
  colNegative: "Share of this theme's mentions where the review complains about it.",
  colMentions: "How many reviews mention this theme. Larger numbers make the percentages more reliable.",
  colThemeSignal: `${themeRule} For Positive Commendations: ${commendationRule}`,
  drivers: `Positive drivers are the themes with the highest share of positive mentions; negative drivers have the highest share of negative ones (themes with at least ${MIN_DRIVER_MENTIONS} mentions). The quotes are the newest real reviews whose own words praise or criticise that theme.`,

  // Review Intelligence tab
  themeSignals: `A quick health check for each topic patients write about. ${themeRule} Hover the ⓘ on a tile to see what it covers; click a tile to read the reviews behind it, grouped by location.`,
  heatmap: `Which topics are a problem where. ${SEGMENT_HELP} Use the switch to group by area, region or type instead. Each cell shows how many of that theme's mentions in that group are negative: High at ${T.PRIORITY}% or more, Moderate from ${T.WATCH}%, Low below ${T.WATCH}%. Positive Commendations shows Strength / Stable / Watch instead. A dash means no mentions. Hover a cell for the number of mentions.`,
  managementInsight: "A one-paragraph summary for managers, written automatically from the theme results above.",
  actions: "Suggested next steps for themes marked Priority or Watch, most urgent first. Under each, up to 3 locations are highlighted where that theme is worst (at least 8 mentions there, and more negative than the theme overall and than 10%): red from 25% negative, amber below. Click one to open it.",
  compareMonths: "Tick Compare months in the filters, then pick the month to look at and the month to compare it with. Every change here is the first month minus the second. The Period filter does not apply to this comparison; Client, Region, Island group, Type and Location do. The current month is not finished, so its volume is not comparable (ratings and rates still are).",
  compareChart: "Each location's figure in the two months, for the measure chosen above. A location with no reviews that month has no bar.",
  compareTable: `Every location with all four measures: the chosen month's figure, the other month's figure under it, and the change (green is better, red is worse; for the 1–2★ share, lower is better). Ratings and rates need at least ${COMPARE.MIN_REVIEWS} reviews in both months, otherwise the change shows -. Click a heading to sort by change.`,
  compareReviews: "Reviews posted in the month (counted by their date on Google, Philippine time).",
  compareRating: "Average stars of the month's reviews.",
  compareReply: "Share of the month's reviews that have an owner reply, as collected so far. Recent reviews may still be waiting for a reply.",
  compareLow: "Share of the month's reviews that are 1 or 2 stars.",
} as const;

/** What each theme tile covers, with examples of the words that count as a mention. */
export const THEME_HELP: Record<ThemeKey, string> = {
  waiting: "Waiting and queues: e.g. wait, queue, pila, antay, matagal, slow, delay.",
  doctors: "Doctors and the care itself: e.g. doctor, dra, OB, pedia, specialist, consultation, check-up.",
  staff: "Nurses, front desk, guards and their attitude: e.g. staff, nurse, receptionist, friendly, rude, mabait, masungit.",
  billing: "Prices, fees and payment: e.g. bill, fee, price, expensive, ang mahal, HMO, PhilHealth, bayad.",
  facilities: "The building and its comfort: e.g. clean, dirty, parking, aircon, toilet, malinis.",
  appointments: "Booking and getting through: e.g. appointment, schedule, booking, call, phone, hotline, Viber.",
  diagnostics: "Tests, results and medicines: e.g. laboratory, x-ray, ultrasound, results, pharmacy, gamot.",
  commendations: "Praise and thanks: e.g. thank you, salamat, recommend, excellent, magaling. Judged by its share of happy reviews instead.",
};

export const themeTileHelp = (key: ThemeKey, kind: "issue" | "commendation") =>
  `${THEME_HELP[key]} ${kind === "commendation" ? commendationRule : themeRule}`;
