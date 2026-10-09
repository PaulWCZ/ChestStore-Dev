// CSV as spreadsheets write it (RFC 4180): quoted fields, doubled quotes,
// line breaks inside quotes, a byte-order mark, comma or semicolon (French
// spreadsheets use ";"). Small and tested; no dependency.

export function parseCsv(text: string, maxRows = 20000): string[][] {
  const source = text.replace(/^\uFEFF/u, "");
  const firstLine = source.slice(0, source.search(/\r?\n|$/u));
  const separator = (firstLine.match(/;/gu)?.length ?? 0) > (firstLine.match(/,/gu)?.length ?? 0) ? ";" : ",";
  // Each cell is a slice of the text (no string built a character at a
  // time: a 5 MB file made millions of strings for the collector).
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  const n = source.length;
  const endRow = () => {
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };
  while (i <= n) {
    let value: string;
    if (source[i] === '"') {
      // Quoted: up to the closing quote, a doubled quote is one.
      const pieces: string[] = [];
      let from = i + 1;
      for (;;) {
        const quote = source.indexOf('"', from);
        if (quote === -1) { pieces.push(source.slice(from)); i = n; break; }
        pieces.push(source.slice(from, quote));
        if (source[quote + 1] === '"') { pieces.push('"'); from = quote + 2; continue; }
        i = quote + 1;
        break;
      }
      value = pieces.join("");
      // Anything after the closing quote, up to the separator, is kept (as
      // spreadsheets do).
      let end = i;
      while (end < n && source[end] !== separator && source[end] !== "\n" && source[end] !== "\r") end++;
      if (end > i) value += source.slice(i, end);
      i = end;
    } else {
      let end = i;
      while (end < n && source[end] !== separator && source[end] !== "\n" && source[end] !== "\r") end++;
      value = source.slice(i, end);
      i = end;
    }
    row.push(value);
    if (i >= n) { endRow(); break; }
    const c = source[i];
    if (c === separator) { i++; if (i === n) { row.push(""); endRow(); break; } continue; }
    // A line break: \r\n, \n or \r.
    i += c === "\r" && source[i + 1] === "\n" ? 2 : 1;
    endRow();
    if (rows.length > maxRows) break;
    if (i === n) break;
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
