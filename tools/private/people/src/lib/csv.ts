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

// A cell a spreadsheet would run as a formula is written behind a quote,
// so exports never carry an injection: one starting with =, @, a tab or a
// return, or with + or - followed by anything else than a number or a
// phone ("+33 6 12 34 56 78", "-3" stay as they are: nothing in them can
// call a function or another program).
export function unsafeCell(text: string): boolean {
  if (/^[=@\t\r]/u.test(text)) return true;
  return /^[+-]/u.test(text) && !/^[+-][0-9\s().\/+-]*$/u.test(text);
}

function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (unsafeCell(text)) text = "'" + text;
  return /[",;\n\r]/u.test(text) ? '"' + text.replace(/"/gu, '""') + '"' : text;
}

// unquote takes back the quote a cell got on the way out ('=…), so a file
// exported by People and imported again round-trips.
export function unquote(text: string): string {
  return /^'[=@+\-\t\r]/u.test(text) ? text.slice(1) : text;
}

export function toCsv(rows: unknown[][]): string {
  return "﻿" + rows.map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
