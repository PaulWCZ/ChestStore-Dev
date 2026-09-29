// Safe in the browser: no SDK here.
// CSV as spreadsheets read and write it (RFC 4180): quoted fields, doubled
// quotes, line breaks inside quotes, a byte-order mark so accents survive,
// and the separator of the reader's language (French spreadsheets use ";"
// and a decimal comma; tabs are read too). Small and tested; no
// dependency. The reader is the Clients tool's (same studio, same licence).

// A cell a spreadsheet would run as a formula (=, +, -, @, tab, return) is
// written behind a quote: exports never carry an injection. A plain
// negative number ("-100,00") stays a number.
function cell(value: unknown, separator: string): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/u.test(text) && !/^-\d+([.,]\d+)?$/u.test(text)) text = "'" + text;
  return text.includes(separator) || /["\n\r]/u.test(text) ? '"' + text.replace(/"/gu, '""') + '"' : text;
}

export function toCsv(rows: unknown[][], separator = ","): string {
  return "\ufeff" + rows.map(r => r.map(v => cell(v, separator)).join(separator)).join("\r\n") + "\r\n";
}

export const separatorFor = (locale: string): string => (locale === "fr" ? ";" : ",");

// parseCsv reads the rows of a spreadsheet saved as CSV: the separator is
// the one the first line uses most (";", "," or a tab).
export function parseCsv(text: string, maxRows = 20000): string[][] {
  const source = text.replace(/^\ufeff/u, "");
  const firstLine = source.slice(0, source.search(/\r?\n|$/u));
  const count = (c: string) => firstLine.split(c).length - 1;
  const separator = [";", ",", "\t"].sort((a, b) => count(b) - count(a))[0]!;
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
