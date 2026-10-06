// CSV as spreadsheets read it (RFC 4180): quoted fields, doubled quotes, a
// byte-order mark so accents survive. Small and tested; no dependency.

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

// parseCsv reads a spreadsheet's CSV: a byte-order mark dropped, commas or
// semicolons (whichever the first line uses more; French Excel writes
// semicolons), quoted fields with doubled quotes and line breaks, CRLF or
// LF. Blank lines are left out. Rows as arrays of trimmed cells.
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/u, "");
  const firstLine = text.split(/\r?\n/u, 1)[0] ?? "";
  const separator = (firstLine.match(/;/gu)?.length ?? 0) > (firstLine.match(/,/gu)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cellText = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cellText += '"'; i++; }
      else if (c === '"') quoted = false;
      else cellText += c;
    } else if (c === '"' && cellText.trim() === "") { quoted = true; cellText = ""; }
    else if (c === separator) { row.push(cellText.trim()); cellText = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cellText.trim());
      if (row.some(x => x !== "")) rows.push(row);
      row = [];
      cellText = "";
    } else cellText += c;
  }
  row.push(cellText.trim());
  if (row.some(x => x !== "")) rows.push(row);
  return rows;
}
