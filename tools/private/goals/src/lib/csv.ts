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
// A negative number is written as it is (a cell that is only a number
// cannot run).
function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/u.test(text) && !/^-\d+([.,]\d+)?$/u.test(text)) text = "'" + text;
  return /[",;\n\r]/u.test(text) ? '"' + text.replace(/"/gu, '""') + '"' : text;
}

// The separator follows the reader's spreadsheet: "," in English, ";"
// where the decimal mark is a comma (French).
export function toCsv(rows: unknown[][], separator: "," | ";" | string = ","): string {
  return "﻿" + rows.map(r => r.map(cell).join(separator)).join("\r\n") + "\r\n";
}
