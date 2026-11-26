// One CSV line (RFC 4180). A cell a spreadsheet would run as a formula
// (= + - @ at its start) is written as text.
export function csvLine(cells: readonly (string | number)[]): string {
  return cells.map(cell => {
    const text = String(cell);
    const safe = typeof cell === "string" && /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text;
    return /[",\r\n]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  }).join(",") + "\r\n";
}

// textStream(lines): a body written as the lines come (an async generator
// reading rows with a cursor): little memory whatever the size; stopped
// when the reader stops (the generator's finally runs).
//   download(() => ({ name: "notes.csv", type: "text/csv; charset=utf-8", body: textStream(rows()) }))
export function textStream(lines: AsyncIterable<string> | Iterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = (async function* () { yield* lines; })();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(encoder.encode(next.value));
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
}
