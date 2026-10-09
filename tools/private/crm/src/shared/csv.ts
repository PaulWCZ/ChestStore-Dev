// CSV as spreadsheets write it (RFC 4180): quoted fields, doubled quotes,
// line breaks inside quotes, a byte-order mark, comma or semicolon (French
// spreadsheets use ";"). Small and tested; no dependency.

export function parseCsv(text: string, maxRows = 20000): string[][] {
  const source = text.replace(/^\uFEFF/u, "");
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
      row.push(unguard(field));
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(unguard(field));
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      if (rows.length > maxRows) break;
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(unguard(field));
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

// A cell a spreadsheet would run as a formula (=, +, -, @, tab, return at
// its start) is written behind a quote: the lists people open never carry
// an injection. A plain number or phone ("+33 6 12 34 56 78", "-5") is no
// formula: kept as it is. raw: the machine export (the whole book's ZIP)
// keeps every value exactly.
const plain = /^[+-]?[\d\s().\/-]*\d[\d\s().\/-]*$/u;
export function cell(value: unknown, raw = false): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (!raw && /^[=+\-@\t\r]/u.test(text) && !plain.test(text)) text = "'" + text;
  return /[",;\n\r]/u.test(text) ? '"' + text.replace(/"/gu, '""') + '"' : text;
}

export function toCsv(rows: unknown[][], raw = false): string {
  return "\uFEFF" + rows.map(r => r.map(c => cell(c, raw)).join(",")).join("\r\n") + "\r\n";
}

// One line of a CSV written as it goes (an export streamed from a cursor);
// the first line of a file carries the byte-order mark (bom).
export function csvRow(cells: readonly unknown[], bom = false, raw = false): string {
  return (bom ? "\uFEFF" : "") + cells.map(c => cell(c, raw)).join(",") + "\r\n";
}

// A cell this tool's own export guarded ("'=…", "'@…"): its value again
// (a file exported here, then imported back).
export const unguard = (text: string): string => (/^'[=+\-@]/u.test(text) ? text.slice(1) : text);
