/**
 * Columns the reviews CSV can contain, in file order: the CX Pulse upload template first, then extras. Shared by the
 * export route (which only accepts these ids) and the column picker. Values are filled in app/api/export/reviews.
 */
export const REVIEW_CSV_COLUMNS = [
  { id: "reference", header: "REFERENCE #", label: "Reference #" },
  { id: "datetime", header: "DATETIME (MM/DD/YYYY H:MM)", label: "Date / time" },
  { id: "branch", header: "HOSPITAL CLINIC BRANCH (PREFIX)", label: "Branch" },
  { id: "first_name", header: "FIRST NAME", label: "First name" },
  { id: "middle_name", header: "MIDDLE NAME", label: "Middle name" },
  { id: "last_name", header: "LAST NAME", label: "Last name" },
  { id: "age", header: "AGE", label: "Age (N/A placeholder)" },
  { id: "location", header: "LOCATION", label: "Location" },
  { id: "gender", header: "GENDER", label: "Gender (N/A placeholder)" },
  { id: "rating", header: "RATING", label: "Rating" },
  { id: "comment", header: "COMMENTS", label: "Comment" },
  { id: "reviewer_link", header: "REVIEWER LINK", label: "Reviewer link" },
  { id: "type", header: "TYPE", label: "Type" },
  { id: "client", header: "CLIENT", label: "Client" },
  { id: "region", header: "REGION", label: "Region" },
  { id: "replied", header: "REPLIED", label: "Replied (Yes / No)" },
  { id: "reply", header: "REPLY", label: "Reply" },
  { id: "reply_date", header: "REPLY DATE (MM/DD/YYYY H:MM)", label: "Reply date" },
] as const;

export type ReviewCsvColumn = (typeof REVIEW_CSV_COLUMNS)[number]["id"];
export const REVIEW_CSV_IDS = REVIEW_CSV_COLUMNS.map((c) => c.id) as ReviewCsvColumn[];

/** The CX Pulse upload template: the file the export has always produced (and still produces without `columns`). */
export const CX_PULSE_COLUMNS: ReviewCsvColumn[] = REVIEW_CSV_IDS.slice(0, 12);

/** `ids` in file order, without unknown ids or repeats. */
export const orderCsvColumns = (ids: Iterable<string>): ReviewCsvColumn[] => {
  const wanted = new Set(ids);
  return REVIEW_CSV_IDS.filter((id) => wanted.has(id));
};
