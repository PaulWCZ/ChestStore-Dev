// CSV as spreadsheets read it (RFC 4180): quoted fields, doubled quotes, a
// byte-order mark so accents open right. Small and tested; no dependency.

// A cell a spreadsheet would run as a formula (=, +, -, @, tab, return) is
// written behind a quote: exports never carry an injection.
function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/u.test(text)) text = "'" + text;
  return /[",;\n\r]/u.test(text) ? '"' + text.replace(/"/gu, '""') + '"' : text;
}

export function toCsv(rows: unknown[][]): string {
  return "\u{FEFF}" + rows.map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
