/**
 * The guided tour's steps (components/tour/tour.tsx). Each points at an element marked `data-tour="<target>"`; with
 * `page`, the tour opens that page first. A step whose element is not on screen (e.g. another tab is open) is skipped.
 */
import type { Role } from "@/lib/schemas/common";

export interface TourStep {
  target: string;
  title: string;
  text: string;
  page?: string;
  roles?: Role[];
  /** Only for people who may run manual extractions (admins, and users an admin allowed). */
  extractors?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  { target: "nav", title: "Your pages", text: "The top bar opens each page: Overview for the quick view of your locations, Dashboard for the analysis, and Extraction for the reviews themselves." },
  { target: "dash-filters", page: "/dashboard", title: "Dashboard filters", text: "Narrow by client, region, island group, type or location. Every tab follows these filters, and the page link keeps them." },
  { target: "dash-tabs", page: "/dashboard", title: "Dashboard tabs", text: "Review Overview, Reputation, Sentiment and Review Intelligence look at your reviews from different angles. In Review Intelligence, click a theme to read its reviews." },
  { target: "dash-period", page: "/dashboard", title: "Period and Compare to", text: "Click Period to pick the dates (presets, the calendar, or typed From / To; it starts on All time). Tick Compare to at the bottom to compare with the previous period, the same period last year or custom dates; every tab then shows ▲ / ▼ changes, and Review Overview adds a side-by-side comparison." },
  { target: "reviews-filters", page: "/extraction", title: "Find reviews", text: "Search and filter every collected review. More filters adds reply status, comment, reply time and region; each active filter shows as a chip you can remove." },
  { target: "reviews-export", page: "/extraction", title: "Columns and Export CSV", text: "Choose which columns the table shows. Export CSV lets you tick the columns for the file and type its name; it follows the filters and sort." },
  { target: "extract", page: "/extraction", title: "Extract reviews", extractors: true, text: "Tick locations and click Extract selected, or Extract all, to collect new reviews and replies from Google. It uses Serper credits: 200 per person per day." },
  { target: "nav-users", title: "Users", roles: ["admin"], text: "Approve new accounts, set roles, allow manual extraction and choose which clients or locations each person can see." },
  { target: "guide", title: "Need help later?", text: "The User guide explains every page and what the numbers mean. You can restart this tour from there." },
];

export const tourStepsFor = (role: Role | undefined, canExtract: boolean) =>
  TOUR_STEPS.filter((s) => (!s.roles || (!!role && s.roles.includes(role))) && (!s.extractors || canExtract));
