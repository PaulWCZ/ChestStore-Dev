// CSV that spreadsheets open as they are (RFC 4180): a byte-order mark so
// Excel reads UTF-8, quoted fields, doubled quotes, line breaks kept inside
// quotes, and the separator of the reader's spreadsheet (French ones expect
// ";"). A text cell a spreadsheet would run as a formula (starting with =,
// +, -, @, a tab or a return, even after spaces) is written behind a quote:
// an export never carries an injection. Numbers stay numbers.

export function cell(value: unknown, separator: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value).replace(".", separator === ";" ? "," : ".") : "";
  let text = String(value);
  if (/^[\s]*[=+\-@\t\r]/u.test(text) || /^[\t\r]/u.test(text)) text = "'" + text;
  return text.includes(separator) || /["\n\r]/u.test(text) ? '"' + text.replace(/"/gu, '""') + '"' : text;
}

export function toCsv(rows: unknown[][], separator: "," | ";" = ","): string {
  return "﻿" + rows.map(r => r.map(v => cell(v, separator)).join(separator)).join("\r\n") + "\r\n";
}
