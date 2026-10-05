// One CSV line (RFC 4180). A cell a spreadsheet would run as a formula
// (= + - @ at its start) is written as text.
export function csvLine(cells: readonly (string | number)[]): string {
  return cells.map(cell => {
    const text = String(cell);
    const safe = typeof cell === "string" && /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text;
    return /[",\r\n]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  }).join(",") + "\r\n";
}
