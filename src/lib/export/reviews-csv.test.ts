import { describe, expect, it } from "vitest";
import { CSV_HEADER, csvCell, csvRow, formatDateTime, splitName, startOfDayInZone } from "./reviews-csv";
import { CX_PULSE_COLUMNS, REVIEW_CSV_COLUMNS, orderCsvColumns } from "./review-columns";

describe("csvCell / csvRow", () => {
  it("leaves plain values alone and empties null", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell(4)).toBe("4");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("quotes values with commas, quotes or line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
  it("neutralises spreadsheet formulas in text", () => {
    for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)"]) expect(csvCell(bad)).toBe(`'${bad}`);
  });
  it("does not touch a negative number", () => {
    expect(csvCell(-1)).toBe("-1");
  });
  it("ends a row with CRLF", () => {
    expect(csvRow(["a", "b,c", null])).toBe('a,"b,c",\r\n');
  });
});

describe("splitName", () => {
  it("splits first, middle initial and last", () => {
    expect(splitName("Mikaela Angeli D. Marquez")).toEqual({ first: "Mikaela Angeli", middle: "D.", last: "Marquez" });
  });
  it("keeps surname particles with the last name", () => {
    expect(splitName("Juan dela Cruz")).toEqual({ first: "Juan", middle: "N/A", last: "dela Cruz" });
  });
  it("keeps a trailing Jr./III with the last name", () => {
    expect(splitName("John Smith Jr.")).toEqual({ first: "John", middle: "N/A", last: "Smith Jr." });
  });
  it("reads 'LAST, FIRST' and title-cases all-caps names", () => {
    expect(splitName("MARQUEZ, MARIA")).toEqual({ first: "Maria", middle: "N/A", last: "Marquez" });
  });
  it("drops a leading list number", () => {
    expect(splitName("15- John Smith")).toEqual({ first: "John", middle: "N/A", last: "Smith" });
  });
  it("uses placeholders for one-word and missing names", () => {
    expect(splitName("Madonna")).toEqual({ first: "Madonna", middle: "N/A", last: "N/A" });
    expect(splitName("")).toEqual({ first: "Anonymous", middle: "N/A", last: "N/A" });
    expect(splitName(null)).toEqual({ first: "Anonymous", middle: "N/A", last: "N/A" });
  });
});

describe("dates", () => {
  it("formats MM/DD/YYYY H:MM in the zone", () => {
    expect(formatDateTime(new Date("2026-11-11T22:30:00Z"), "Asia/Manila")).toBe("11/12/2026 6:30");
    expect(formatDateTime(new Date("2026-11-11T22:30:00Z"), "UTC")).toBe("11/11/2026 22:30");
  });
  it("finds the start of a calendar day in the zone", () => {
    expect(startOfDayInZone("2026-11-12", "Asia/Manila").toISOString()).toBe("2026-11-11T16:00:00.000Z");
    expect(startOfDayInZone("2026-11-12", "UTC").toISOString()).toBe("2026-11-12T00:00:00.000Z");
  });
});

describe("columns", () => {
  it("keeps the CX Pulse template header in step with the column list", () => {
    expect(CSV_HEADER).toHaveLength(12);
    expect(CX_PULSE_COLUMNS.map((id) => REVIEW_CSV_COLUMNS.find((c) => c.id === id)?.header)).toEqual([...CSV_HEADER]);
  });
  it("orders requested columns in file order and drops unknown or repeated ids", () => {
    expect(orderCsvColumns(["comment", "reference", "bogus", "comment"])).toEqual(["reference", "comment"]);
  });
});
