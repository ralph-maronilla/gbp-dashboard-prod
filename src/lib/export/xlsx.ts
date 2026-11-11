/**
 * Minimal Excel workbook (.xlsx) writer: plain text and numbers, a bold, frozen header row with filter buttons, column
 * widths and wrapped columns. Enough for exports; no formulas, so cell text is never run as one (all text is written
 * as inline strings). Pure apart from the zip, so it can be tested.
 */
import { strToU8, zipSync } from "fflate";

export type Cell = string | number | null | undefined;

export interface Sheet {
  name: string;
  rows: Cell[][];
  /** Index of the table's header row: bold, frozen with everything above it, filter buttons on its columns. */
  headerRow?: number;
  /** Other rows to show in bold (titles above the table). */
  boldRows?: number[];
  /** Column widths in characters. */
  widths?: number[];
  /** Columns (0-based) whose text wraps in the table body. */
  wrapCols?: number[];
}

/** Excel's limit per cell. */
const MAX_CELL = 32_767;
const MAX_SHEET_NAME = 31;

// Characters XML 1.0 does not allow (control characters other than tab, line feed and carriage return).
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function colName(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * A valid, unique sheet name: Excel forbids `[]:*?/\`, a leading or trailing apostrophe and more than 31 characters,
 * and compares names ignoring case. Adds " (2)", " (3)"... to repeats. Adds the chosen name to `taken` (lower case).
 */
export function safeSheetName(wanted: string, taken: Set<string>): string {
  const base = wanted.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "") || "Sheet";
  for (let i = 1; ; i++) {
    const suffix = i === 1 ? "" : ` (${i})`;
    const name = base.slice(0, MAX_SHEET_NAME - suffix.length).trimEnd() + suffix;
    if (!taken.has(name.toLowerCase())) {
      taken.add(name.toLowerCase());
      return name;
    }
  }
}

function cellXml(ref: string, value: Cell, style: number): string {
  const s = style ? ` s="${style}"` : "";
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : "";
  const text = esc(value.replace(INVALID_XML, "").slice(0, MAX_CELL));
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

// Styles: 0 = normal (top aligned), 1 = bold, 2 = wrapped text (top aligned).
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(sheet: Sheet): { xml: string; filterRef: string | null } {
  const cols = Math.max(1, ...sheet.rows.map((r) => r.length));
  const bold = new Set(sheet.boldRows ?? []);
  if (sheet.headerRow !== undefined) bold.add(sheet.headerRow);
  const wrap = new Set(sheet.wrapCols ?? []);
  const header = sheet.headerRow;

  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => cellXml(`${colName(c)}${r + 1}`, v, bold.has(r) ? 1 : header !== undefined && r > header && wrap.has(c) ? 2 : 0))
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");

  const last = `${colName(cols - 1)}${Math.max(1, sheet.rows.length)}`;
  const pane =
    header !== undefined
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${header + 1}" topLeftCell="A${header + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const widths = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const filterRef = header !== undefined && sheet.rows.length > header ? `A${header + 1}:${colName(cols - 1)}${sheet.rows.length}` : null;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${last}"/>${pane}<sheetFormatPr defaultRowHeight="15"/>${widths}<sheetData>${rows}</sheetData>${filterRef ? `<autoFilter ref="${filterRef}"/>` : ""}</worksheet>`;
  return { xml, filterRef };
}

/** The workbook as .xlsx bytes. Sheet names must already be valid and unique (safeSheetName). */
export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const parts = sheets.map(sheetXml);
  const quote = (name: string) => `'${name.replace(/'/g, "''")}'`;
  const absolute = (ref: string) => ref.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2");
  const defined = parts
    .map((p, i) => (p.filterRef ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(quote(sheets[i]!.name))}!${absolute(p.filterRef)}</definedName>` : ""))
    .join("");

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join("")}</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ""}</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(STYLES),
  };
  parts.forEach((p, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(p.xml)));
  return zipSync(files, { level: 6 });
}
