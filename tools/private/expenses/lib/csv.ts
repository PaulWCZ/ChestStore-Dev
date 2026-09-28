// CSV as spreadsheets read it (RFC 4180): quoted fields, doubled quotes, a
// byte-order mark so accents survive, and the separator of the reader's
// language (French spreadsheets use ";" and a decimal comma). Small and
// tested; no dependency.

// A cell a spreadsheet would run as a formula (=, +, -, @, tab, return) is
// written behind a quote: exports never carry an injection.
function cell(value: unknown, separator: string): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/u.test(text)) text = "'" + text;
  return text.includes(separator) || /["\n\r]/u.test(text) ? '"' + text.replace(/"/gu, '""') + '"' : text;
}

export function toCsv(rows: unknown[][], separator = ","): string {
  return "\ufeff" + rows.map(r => r.map(v => cell(v, separator)).join(separator)).join("\r\n") + "\r\n";
}

export const separatorFor = (locale: string): string => (locale === "fr" ? ";" : ",");
