// The tool's log: its standard output and error are its log in the Chest
// (the Logs tab, kept 7 days, a line cut at 4 KiB; the Chest adds the time).
// One line per event, "level message key=value…", for an operator who
// reads it to understand a failure. Never a secret, a token, an address,
// a name, a message's text or any personal data: ids and counts only.
type Value = string | number | boolean | null | undefined;

function line(level: "info" | "warn" | "error", message: string, data: Record<string, Value>): string {
  const pairs = Object.entries(data).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${clean(String(v))}`);
  return [level, clean(message), ...pairs].join(" ").slice(0, 2000);
}
// One line, whatever the value holds; quoted when it has spaces.
const clean = (text: string) => {
  const flat = text.replace(/[\u0000-\u001f\u007f]+/gu, " ").slice(0, 300);
  return /\s|"/u.test(flat) ? JSON.stringify(flat) : flat;
};

export const log = {
  info: (message: string, data: Record<string, Value> = {}) => console.log(line("info", message, data)),
  warn: (message: string, data: Record<string, Value> = {}) => console.warn(line("warn", message, data)),
  // An error's kind and where it was thrown — its message only for errors
  // of the code (a database error's detail holds the row's values).
  error: (message: string, error: unknown, data: Record<string, Value> = {}) => {
    const e = error instanceof Error ? error as Error & { code?: unknown; constraint_name?: unknown } : null;
    const at = e?.stack?.split("\n").find(l => l.includes("/src/") || l.includes("/dist/"))?.trim().replace(/^at /u, "");
    const database = typeof e?.code === "string" && /^[0-9A-Z]{5}$/u.test(e.code);
    console.error(line("error", message, { ...data, error: e?.name ?? typeof error, code: typeof e?.code === "string" ? e.code : undefined, constraint: typeof e?.constraint_name === "string" ? e.constraint_name : undefined, detail: e && !database ? e.message : undefined, at }));
  },
};
