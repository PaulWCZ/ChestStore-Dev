// CSV as spreadsheets write it (RFC 4180): quoted fields, doubled quotes,
// line breaks inside quotes, a byte-order mark, comma or semicolon (French
// spreadsheets use ";"). Small and tested; no dependency.

export function parseCsv(text: string, maxRows = 20000): string[][] {
  const source = text.replace(/^﻿/u, "");
  const firstLine = source.slice(0, source.search(/\r?\n|$/u));
  const separator = (firstLine.match(/;/gu)?.length ?? 0) > (firstLine.match(/,/gu)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === separator) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      if (rows.length > maxRows) break;
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

// A cell a spreadsheet would run as a formula (=, +, -, @, tab, return) is
// written behind a quote: exports never carry an injection.
function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/u.test(text)) text = "'" + text;
  return /[",;\n\r]/u.test(text) ? '"' + text.replace(/"/gu, '""') + '"' : text;
}

export function toCsv(rows: unknown[][]): string {
  return "﻿" + rows.map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

// One line of the export, with the separator the reader's spreadsheet
// expects: ";" in French (Excel set to French reads a comma file as one
// column), "," otherwise. Quoted when it holds the separator, a quote or a
// line break; a cell that would run as a formula is written behind a
// quote.
export const separatorOf = (locale: string): "," | ";" => (locale === "fr" ? ";" : ",");
export function csvRow(cells: readonly unknown[], separator: "," | ";" = ","): string {
  return cells.map(value => {
    let text = value === null || value === undefined ? "" : String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/u.test(text)) text = "'" + text;
    return text.includes(separator) || /["\n\r]/u.test(text) ? '"' + text.replace(/"/gu, '""') + '"' : text;
  }).join(separator) + "\r\n";
}
