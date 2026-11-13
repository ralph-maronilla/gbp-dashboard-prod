import type { ReviewRow } from "@/lib/schemas/extract";
import { REVIEW_CSV_COLUMNS, type ReviewCsvColumn } from "./review-columns";
import { PLACEHOLDER } from "./reviews-csv";

/** Column id → its header text in the CSV and in the Google Sheet. */
export const REVIEW_HEADER = new Map<ReviewCsvColumn, string>(REVIEW_CSV_COLUMNS.map((c) => [c.id, c.header]));

/**
 * One cell of a review, for the CSV export and the Google Sheet mirror. The CX Pulse columns are exactly as the export
 * has always produced them (AGE and GENDER are always N/A).
 */
export function reviewCell(r: ReviewRow, column: ReviewCsvColumn): string | number {
  switch (column) {
    case "reference": return Number(r.reference);
    case "datetime": return r.datetime;
    case "branch": return r.branch;
    case "first_name": return r.first_name;
    case "middle_name": return r.middle_name;
    case "last_name": return r.last_name;
    case "age": return PLACEHOLDER;
    case "location": return r.location;
    case "gender": return PLACEHOLDER;
    case "rating": return r.rating;
    case "comment": return r.comment ?? "";
    case "reviewer_link": return r.reviewer_url ?? "";
    case "type": return r.location_type ?? "";
    case "client": return r.client;
    case "region": return r.region ?? "";
    case "replied": return r.reply ? "Yes" : "No";
    case "reply": return r.reply ?? "";
    case "reply_date": return r.reply_date ?? "";
  }
}
