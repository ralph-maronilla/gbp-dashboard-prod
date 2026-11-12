/**
 * The User guide (/guide): every page and feature, and what users need to know about the numbers. Content is data so
 * the page and its search read the same text. A section or block with `roles` is shown only to those roles (with a tag
 * saying who can use it). `**bold**` marks words in the text. Keep in step with the screens when they change.
 */
import type { Role } from "@/lib/schemas/common";

export type GuideBlock =
  | { kind: "h"; text: string; roles?: Role[] }
  | { kind: "p"; text: string; roles?: Role[] }
  | { kind: "list"; items: string[]; roles?: Role[] }
  | { kind: "steps"; items: string[]; roles?: Role[] }
  | { kind: "table"; head: string[]; rows: string[][]; roles?: Role[] }
  | { kind: "note"; text: string; roles?: Role[] };

export interface GuideSection {
  id: string;
  title: string;
  /** One line under the title. */
  summary: string;
  roles?: Role[];
  goTo?: { label: string; href: string }[];
  blocks: GuideBlock[];
}

const ADMIN: Role[] = ["admin"];

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    summary: "Signing in, roles, finding your way around.",
    blocks: [
      { kind: "h", text: "Signing up and signing in" },
      {
        kind: "list",
        items: [
          "Create an account on the **Sign up** page. An admin approves new accounts; until then you see **Waiting for approval**.",
          "Forgot your password? Use **Forgot your password?** on the sign-in page and follow the link in the email.",
          "For safety you are **signed out after 1 hour without activity**. A few minutes before, a “Still there?” message lets you stay signed in.",
        ],
      },
      { kind: "h", text: "Roles" },
      {
        kind: "table",
        head: ["What you can do", "Viewer", "Manager", "Admin"],
        rows: [
          ["See Overview, Dashboard and location pages", "Yes", "Yes", "Yes"],
          ["Browse and export reviews (CSV, Excel)", "Yes", "Yes", "Yes"],
          ["Run extractions (uses Serper credits)", "If an admin allows", "If an admin allows", "Yes"],
          ["Add, edit or remove locations; refresh Google totals", "No", "No", "Yes"],
          ["Turn automatic extraction on or off, set its time", "No", "No", "Yes"],
          ["Approve users, set roles and access", "No", "No", "Yes"],
        ],
      },
      { kind: "p", text: "Viewers and managers only see the locations an admin gave them access to, directly or through a client." },
      { kind: "h", text: "Finding your way" },
      {
        kind: "list",
        items: [
          "The **sidebar** on the left opens each page: Overview, Dashboard, Extraction (and Users for admins). The ☰ button at the top hides or shows it; on a phone it slides out.",
          "The **sun / moon** button at the top switches between light and dark mode.",
          "**User guide** at the bottom of the sidebar opens this page. **Start the tour** at the top of this page walks you through the main screens again.",
          "Filters on the Dashboard and Extraction pages are kept in the page address, so you can bookmark a view or send the link to a colleague.",
        ],
      },
    ],
  },
  {
    id: "overview",
    title: "Overview",
    summary: "The quick view of every location you can see.",
    goTo: [{ label: "Open Overview", href: "/" }],
    blocks: [
      {
        kind: "list",
        items: [
          "**Cards** at the top: number of locations, total reviews, average rating, new reviews in the last 7 days, **unanswered** reviews and **1–2 star** reviews.",
          "The **locations table** lists each location with its reviews, rating, new reviews, unanswered and low-rating counts, a 12-week trend and when it was last extracted. Search by name, filter by client (group) and click a column heading to sort.",
          "Click a location to open its **location page**.",
          "**Export** downloads the reviews as a CSV in the CX Pulse upload layout, for a client and a date range.",
        ],
      },
    ],
  },
  {
    id: "location-page",
    title: "Location page",
    summary: "One location's rating trend and its reviews.",
    blocks: [
      {
        kind: "list",
        items: [
          "The **rating trend** shows how the average rating moved over time.",
          "The **reviews** list shows each review with its stars, date, text and owner reply; reviews without a reply are tagged **Unanswered**.",
          "Filter the list by stars, by **Replies** (replied or unanswered) and by dates, or search the text.",
        ],
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    summary: "Reputation analysis across locations, with filters and comparisons.",
    goTo: [{ label: "Open Dashboard", href: "/dashboard" }],
    blocks: [
      { kind: "h", text: "Filters" },
      {
        kind: "list",
        items: [
          "**Period** starts on **All time**. Click it to open the date picker: choose a preset under **Last** (Last 7 days, Last month, Last 12 months, …) or **Current** (Today, This week, This month, This year), click days on the calendar, or type **From** and **To** dates. **Custom** sets what a calendar click selects: a period (first and last day), a whole week, a whole month or one day. Click **Apply**.",
          "**Client**, **Region**, **Island group**, **Type** (Hospital, Outpatient Center, …) and **Location** apply to every tab.",
          "The time next to **Updated** shows when the figures were loaded; the ↻ button reloads them.",
          "Each **ⓘ** next to a figure explains how it is worked out.",
        ],
      },
      { kind: "h", text: "Review Overview" },
      {
        kind: "list",
        items: [
          "Totals and ratings per location. **Google** figures are Google's own public totals; **Extracted** figures count the reviews collected into this app. Switch between them with the toggle when both exist.",
        ],
      },
      { kind: "h", text: "Compare two date ranges" },
      {
        kind: "steps",
        items: [
          "Click **Period** and choose the dates to look at (any preset except All time, or custom days).",
          "Tick **Compare to** at the bottom of the picker and choose **previous period** (the same length just before), **same period last year**, or **custom dates** (type them, or set “Calendar sets” to Compare to and click them on the calendar).",
          "Click **Apply**. The Period button now shows both ranges, and **every tab** shows the change against the Compare-to dates under its figures: ▲ / ▼ in green when better, red when worse (hover for the compared value). Reputation's charts draw both ranges, lined up bucket by bucket. Ratings and percentages are only compared when both ranges have at least 5 reviews or mentions.",
          "On **Review Overview** a side-by-side comparison also appears under the overview: four headline changes, a chart per location and a table you can sort by change. The Reputation highlights compare with these dates too.",
          "While comparing, both ranges are counted in full: figures that normally use the last 30 or 90 days (Escalation Watch, Activity, Attention) cover the whole period, so the two sides match.",
        ],
      },
      {
        kind: "note",
        text: "Green means better and red worse (for the 1–2★ share, lower is better). Ratings and rates need a few reviews in both ranges before a change is shown. A range that includes today, or two ranges of different lengths, are not comparable on review volume; ratings and rates still are.",
      },
      { kind: "h", text: "Reputation" },
      { kind: "p", text: "Ratings, response rate and low-rating share over time and by group (area, segment, region, island, type), with charts by month, quarter or year." },
      { kind: "h", text: "Sentiment and Review Intelligence" },
      {
        kind: "list",
        items: [
          "Reviews are sorted into **themes** (Waiting time, Doctors, Staff, Billing, Facilities, Appointments, Diagnostics, Positive Commendations) and read as positive, mixed or negative.",
          "The **heatmap** shows how each group of locations does on each theme.",
          "**Click a theme tile** to read its reviews, grouped by location, with the matching words highlighted. Filter by Negative / Mixed / Positive or search.",
          "**Export to Excel** downloads a workbook: a Summary tab and one tab per location, one row per review per theme. The **Export** button in the theme panel exports just that theme with its filters.",
        ],
      },
    ],
  },
  {
    id: "extraction",
    title: "Extraction",
    summary: "Collecting reviews from Google, and browsing or exporting them.",
    goTo: [{ label: "Open Extraction", href: "/extraction" }],
    blocks: [
      { kind: "h", text: "Browsing reviews" },
      {
        kind: "list",
        items: [
          "The **Reviews** table lists every collected review, 25 to 100 per page. Click a row to read the full review and the owner's reply.",
          "Filter by search text, **Client**, **Type**, **Location**, dates and **Rating**.",
          "**More filters** adds Reply status (replied / not replied), Comment (with text / rating only), Reply time (within 1 day, 1–7 days, over 7 days), Region, Island group and where to search (comment, reply, reviewer name). Each active one shows as a chip; click its ✕ to remove it. **Clear** removes all filters.",
          "Click a column heading to sort. **Columns** shows or hides columns (Client, Region and Reply date start hidden).",
        ],
      },
      { kind: "h", text: "Exporting to CSV" },
      {
        kind: "steps",
        items: [
          "Set the filters and sort you want; the file follows them.",
          "Click **Export CSV**.",
          "Tick the columns, or use a preset: **CX Pulse layout** (the upload template), **All columns**, or **Same as table**. Your choice is remembered.",
          "Type a **file name** (the suggestion includes the location and today's date) and click **Download**.",
        ],
      },
      { kind: "note", text: "One file holds up to 100,000 reviews. For more, narrow the dates or locations." },
      { kind: "h", text: "Running an extraction" },
      {
        kind: "note",
        text: "Manual extraction is for admins and for the people an admin allows (Users page, **Manual extraction** switch). Everyone else sees a card with the **automatic extraction** time instead of the Extract buttons.",
      },
      {
        kind: "list",
        items: [
          "In **Locations**, tick locations and click **Extract selected**, or **Extract all** (or the filtered ones). Progress shows under the buttons; **Stop** ends it.",
          "Only new and changed reviews are saved, including owner replies and edits. A location's **Status** shows if it is up to date or had a problem (hover the chip for the reason).",
          "Extraction uses **Serper credits**: each user has **200 a day** and everyone together **5,000 a day** (counted per UTC day). The chips at the top of the page show what is left.",
        ],
      },
      { kind: "h", text: "Managing locations", roles: ADMIN },
      {
        kind: "list",
        roles: ADMIN,
        items: [
          "**Add locations** by pasting Google Maps links or place IDs, one per line (optionally “Name | link”), and choosing their client. **Edit** (pencil) sets the name, branch prefix, address, region, type and clients; names, prefixes and addresses can also be edited in the table.",
          "The **Active** switch stops a location from being extracted and hides it from non-admins without deleting its reviews. The bin deletes it.",
          "**Refresh Google totals** reads each location's public rating and review count from Google (uses credits). **Auto-fill regions** fills empty regions from addresses (free).",
        ],
      },
      { kind: "h", text: "Automatic extraction", roles: ADMIN },
      {
        kind: "list",
        roles: ADMIN,
        items: [
          "Turn on **Automatic extraction**, choose the time (Philippine time, 15-minute steps) and a credit limit per day, then **Save**.",
          "The card shows the next run, the last run and whether the scheduler is connected. Big extractions continue in follow-up runs until done or the credit limit is reached.",
        ],
      },
    ],
  },
  {
    id: "users",
    title: "Users",
    summary: "Approving accounts and giving access.",
    roles: ADMIN,
    goTo: [{ label: "Open Users", href: "/admin/users" }],
    blocks: [
      {
        kind: "list",
        items: [
          "New sign-ups appear as **pending**: **Approve** or **Reject** them.",
          "Set each user's **Role** (viewer, manager, admin).",
          "**Manual extraction** allows a viewer or manager to run extractions (it uses Serper credits). It is off for new users; admins can always extract.",
          "**Access** chooses which locations a viewer or manager sees: whole **clients** or **individual locations**. Admins always see everything.",
          "**Credits** shows each user's Serper credits today and in the last 30 days; **Activity** shows who is online and on which page.",
        ],
      },
    ],
  },
  {
    id: "numbers",
    title: "Understanding the numbers",
    summary: "Where the figures come from and their limits.",
    blocks: [
      {
        kind: "list",
        items: [
          "**Google totals vs extracted reviews**: Google's total includes reviews Google does not show in full; the extracted count is what has been collected here. They can differ, especially before a location's first full extraction.",
          "**Dates and times** are in **Philippine time**.",
          "**Themes and sentiment** are estimated from keywords and, when a review has no matching words, from its stars. They are a guide, not a reading of every review: a phrase like “matagal na” can be counted as Waiting time.",
          "**Response rate** is the share of reviews with an owner reply, as collected so far; recent reviews may still be waiting for one.",
          "**Reply time** and **reply dates** are exact when the reply was noticed soon after it was posted; otherwise they are approximate, because Google only shows “3 weeks ago”.",
          "The **current month** or a range that includes **today** is not finished, so its review volume is lower than a full period.",
        ],
      },
    ],
  },
  {
    id: "help",
    title: "Troubleshooting",
    summary: "Common messages and what to do.",
    blocks: [
      {
        kind: "table",
        head: ["You see", "What to do"],
        rows: [
          ["“You don't have access”", "Ask an admin to give you access to the locations or client."],
          ["An empty table or chart", "Check the filters (or press Clear). The location may not have been extracted yet."],
          ["“Too many requests, please try again later”", "Wait a minute and try again."],
          ["“… reviews match; narrow the date range”", "The export is too big for one file: pick fewer dates or locations."],
          ["Extraction stops with a credit message", "The daily credits are used up; they reset the next day (UTC)."],
          ["Signed out unexpectedly", "You were inactive for an hour; sign in again."],
        ],
      },
      { kind: "p", text: "Still stuck? Contact your admin." },
    ],
  },
];

const visible = (roles: Role[] | undefined, role: Role | undefined) => !roles || (!!role && roles.includes(role));
const plain = (s: string) => s.replace(/\*\*/g, "");
const blockText = (b: GuideBlock) =>
  b.kind === "list" || b.kind === "steps" ? b.items.join(" ") : b.kind === "table" ? [...b.head, ...b.rows.flat()].join(" ") : b.text;

/** The sections and blocks `role` may see. */
export function guideFor(role: Role | undefined): GuideSection[] {
  return GUIDE_SECTIONS.filter((s) => visible(s.roles, role)).map((s) => ({ ...s, blocks: s.blocks.filter((b) => visible(b.roles, role)) }));
}

/** Sections that mention every word of `query` (case-insensitive) in their title, summary or text. */
export function searchGuide(sections: GuideSection[], query: string): GuideSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return sections;
  return sections.filter((s) => {
    const text = plain([s.title, s.summary, ...s.blocks.map(blockText)].join(" ")).toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** "Admins only" / "Admins and managers" for parts not everyone can use. */
export function rolesTag(roles: Role[] | undefined): string | null {
  if (!roles) return null;
  if (roles.length === 1 && roles[0] === "admin") return "Admins only";
  if (roles.includes("admin") && roles.includes("manager") && !roles.includes("viewer")) return "Admins and managers";
  return null;
}
