import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { after, beforeEach } from "node:test";
import postgres from "postgres";

// Tests of a tool: its database, the rules of its pages and sources.

// ---- testDatabase(): a database for a test file, the migrations played
// as the Chest plays them (name order, each once), DATABASE_URL set in
// the shape the Chest gives (databaseUrl() and db() work unchanged).
// Where it comes from, the lightest first:
//   1. TEST_DATABASE_URL (a PostgreSQL user who may create roles: the
//      studio's local server) — a throwaway role and database t_test_…;
//   2. DATABASE_URL already the Chest's (the Perseus preview's pb_…) — a
//      throwaway schema in it (TEST_DATABASE_SCHEMA tells db());
//   3. otherwise PGlite in the test's process (devDependencies
//      @electric-sql/pglite and @electric-sql/pglite-socket): ~500 MiB
//      more memory — the last resort.
// close() drops what it made.
export type TestDatabase = { sql: postgres.Sql; kind: "server" | "preview" | "pglite"; close(): Promise<void> };
const chestShape = /^postgres:\/\/(t_[a-z][a-z0-9_]{0,47}|pb_[a-z2-7]{26}):[^@]+@127\.0\.0\.1:\d+\/\1\?sslmode=disable$/u;
const quiet = { onnotice: () => {} };

export async function testDatabase({ migrations = "migrations" }: { migrations?: string } = {}): Promise<TestDatabase> {
  const files = existsSync(migrations) ? readdirSync(migrations).filter(f => /^\d{4}_[a-z0-9_-]+\.sql$/u.test(f)).sort().map(f => readFileSync(join(migrations, f), "utf8")) : [];
  const name = `t_test_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const server = process.env["TEST_DATABASE_URL"];
  if (server) {
    const admin = postgres(server, { max: 1, ...quiet });
    const password = Math.random().toString(36).slice(2);
    await admin.unsafe(`create role ${name} login password '${password}'`);
    await admin.unsafe(`create database ${name} owner ${name}`);
    const base = new URL(server);
    process.env["DATABASE_URL"] = `postgres://${name}:${password}@127.0.0.1:${base.port || 5432}/${name}?sslmode=disable`;
    delete process.env["TEST_DATABASE_SCHEMA"];
    const sql = postgres(process.env["DATABASE_URL"], { max: 2, ...quiet });
    for (const text of files) await sql.begin(tx => tx.unsafe(text).simple());
    return {
      sql,
      kind: "server",
      async close() {
        await sql.end();
        await admin.unsafe(`drop database if exists ${name} with (force)`);
        await admin.unsafe(`drop role if exists ${name}`);
        await admin.end();
      },
    };
  }
  const preview = process.env["DATABASE_URL"];
  if (preview && chestShape.test(preview)) {
    const schema = name.replace(/^t_/u, "");
    const sql = postgres(preview, { max: 2, connection: { search_path: schema }, ...quiet });
    await sql.unsafe(`create schema ${schema}`);
    process.env["TEST_DATABASE_SCHEMA"] = schema;
    for (const text of files) await sql.begin(tx => tx.unsafe(text).simple());
    return {
      sql,
      kind: "preview",
      async close() {
        await sql.unsafe(`drop schema if exists ${schema} cascade`);
        await sql.end();
        delete process.env["TEST_DATABASE_SCHEMA"];
      },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const pg = await PGlite.create();
  const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 8 });
  await socket.start();
  const port = (socket as unknown as { server: { address(): { port: number } } }).server.address().port;
  process.env["DATABASE_URL"] = `postgres://t_test:test@127.0.0.1:${port}/t_test?sslmode=disable`;
  delete process.env["TEST_DATABASE_SCHEMA"];
  for (const text of files) await pg.exec(text);
  const sql = postgres(process.env["DATABASE_URL"], { max: 1, ...quiet });
  return { sql, kind: "pglite", async close() { await sql.end(); await socket.stop(); await pg.close(); } };
}

// ---- checkPage(html): what the policy would block, found in a page the
// server rendered: a style attribute (React's style={}), an inline
// script, a <style> element. Throws with the first one.
export function checkPage(html: string): string {
  const found = /<[a-z][^>]*\sstyle=/iu.exec(html)?.[0] ?? /<script(?![^>]*\bsrc=)[^>]*>/iu.exec(html)?.[0] ?? /<style[\s>]/iu.exec(html)?.[0];
  if (found) throw new Error(`the policy blocks this in the page: ${found.slice(0, 120)}`);
  return html;
}

// ---- checkWords(catalogues): every language says every text of the
// first (the source), with the same {placeholders}; French is written with
// a narrow no-break space ( ) before : ; ? ! and none missing.
export function checkWords(catalogues: Record<string, object>): void {
  const leaves = (value: unknown, path = ""): [string, string][] =>
    typeof value === "string" ? [[path, value]] : value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value).flatMap(([k, v]) => leaves(v, `${path}.${k}`)) : [];
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/gu)].map(m => m[1]).sort().join(",");
  const [source, ...others] = Object.entries(catalogues);
  if (!source) throw new Error("no catalogue");
  const reference = new Map(leaves(source[1]));
  const problems: string[] = [];
  for (const [locale, catalogue] of others) {
    const theirs = new Map(leaves(catalogue));
    for (const [path, text] of reference) {
      const other = theirs.get(path);
      if (other === undefined) problems.push(`${locale}${path}: missing`);
      else if (placeholders(other) !== placeholders(text)) problems.push(`${locale}${path}: {placeholders} differ from ${source[0]}`);
    }
    for (const path of theirs.keys()) if (!reference.has(path)) problems.push(`${locale}${path}: not in ${source[0]}`);
  }
  const fr = catalogues["fr"];
  if (fr) {
    for (const [path, text] of leaves(fr)) {
      if (path.startsWith(".kit.")) continue;
      if (/[  ][:;?!]/u.test(text) || /[^\s  ([{:/][;?!]/u.test(text) || /\p{L}:(\s|$)/u.test(text)) problems.push(`fr${path}: a narrow no-break space ( ) goes before : ; ? ! — "${text}"`);
    }
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));
}

// ---- checkSources(): the rules a type cannot check, read in the tool's
// sources (src/, chest.json):
// - no style={} (nor a spread that carries one): the policy blocks it;
// - islands never import the SDK or server code;
// - CSS names no colour (the kit's tokens only);
// - every class a page names exists (the tool's CSS or the kit's);
// - each capability of chest.json is used, and each used is declared;
//   "receives" goes with events.handle, "schedules" with their handlers.
export function checkSources({ root = "." }: { root?: string } = {}): void {
  const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])) : []);
  const files = walk(join(root, "src"));
  const code = files.filter(f => /\.tsx?$/u.test(f)).map(f => ({ file: f, text: readFileSync(f, "utf8") }));
  const css = files.filter(f => f.endsWith(".css")).map(f => readFileSync(f, "utf8")).join("\n");
  const problems: string[] = [];
  for (const { file, text } of code) {
    if (/\bstyle\s*=\s*\{|\{\s*\.\.\.\s*\{[^}]*\bstyle\b/u.test(text)) problems.push(`${file}: style={} — the policy blocks style attributes: use a class, an SVG attribute, <progress> or <meter>`);
    // Islands, and the components they share with pages (src/components/).
    if (file.includes(join("src", "islands")) || file.includes(join("src", "components")) || /src[/\\](entry|client)\.tsx?$/u.test(file)) {
      if (/^import (?!type)[^;]*from "@argentic\/chest-sdk/mu.test(text)) problems.push(`${file}: the SDK is for the server only`);
      if (/^import (?!type)[^;]*from "@argentic\/chest-app(\/(db|members|testing|vite))?"/mu.test(text)) problems.push(`${file}: server code in the browser — import from "@argentic/chest-app/client"`);
      if (/^import (?!type)[^;]*from "\.\.?\/(lib|actions|app)\b/mu.test(text)) problems.push(`${file}: server code in the browser`);
    }
  }
  const noComments = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  const colour = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|lab|lch)\(|(?<![\w-])(white|black)(?![\w-])/iu.exec(noComments);
  if (colour) problems.push(`CSS: a colour (${colour[0]}) — use the kit's tokens (var(--ink)…)`);
  let kitCss = "";
  try {
    kitCss = readFileSync(createRequire(resolve(root, "package.json")).resolve("@argentic/chest-ui/components.css"), "utf8");
  } catch { /* the kit not installed: only the tool's CSS counts */ }
  const known = new Set([...`${noComments}\n${kitCss}`.matchAll(/\.(-?[_a-zA-Z][\w-]*)/gu)].map(m => m[1]));
  for (const { file, text } of code.filter(c => c.file.endsWith(".tsx"))) {
    for (const m of text.matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/gu)) {
      const literals = m[1] !== undefined ? [m[1]] : [...(m[2] ?? "").matchAll(/"([^"]*)"|'([^']*)'|`([^`$]*)/gu)].map(x => x[1] ?? x[2] ?? x[3] ?? "");
      // A name ending with "-" is a family the code completes
      // (`c-${color}`): some class of the stylesheets must start with it.
      const defined = (name: string) => (name.endsWith("-") ? [...known].some(k => k !== undefined && k.startsWith(name) && k.length > name.length) : known.has(name));
      for (const name of literals.flatMap(l => l.split(/\s+/u)).filter(Boolean)) if (!defined(name)) problems.push(`${file}: the class "${name}" is in no stylesheet (the tool's or the kit's)`);
    }
  }
  const manifest = JSON.parse(readFileSync(join(root, "chest.json"), "utf8")) as { capabilities?: string[]; receives?: string[]; schedules?: { name: string }[] };
  const all = code.map(c => c.text).join("\n");
  const uses: Record<string, RegExp> = {
    database: /from "@argentic\/chest-(app\/db|sdk\/database)"/u,
    members: /from "@argentic\/chest-(app\/members|sdk\/members)"/u,
    files: /from "@argentic\/chest-sdk\/files"/u,
    notifications: /from "@argentic\/chest-sdk\/notifications"/u,
    ai: /from "@argentic\/chest-sdk\/ai"/u,
  };
  const declared = new Set(manifest.capabilities ?? []);
  for (const [capability, use] of Object.entries(uses)) {
    if (declared.has(capability) && !use.test(all)) problems.push(`chest.json asks "${capability}" and src/ never uses it: remove it (the owner approves each one)`);
    if (!declared.has(capability) && use.test(all)) problems.push(`src/ uses "${capability}": declare it in chest.json "capabilities"`);
  }
  const handlesEvents = /events\.handle\(/u.test(all);
  if ((manifest.receives?.length ?? 0) > 0 && !handlesEvents) problems.push(`chest.json "receives" without events.handle on /chest-events`);
  if ((manifest.receives?.length ?? 0) === 0 && handlesEvents && /"member\.[a-z]+"\s*:/u.test(all)) problems.push(`events handled without "receives": ["member.*"] in chest.json`);
  for (const { name } of manifest.schedules ?? []) if (!new RegExp(`["']?\\b${name}\\b["']?\\s*:`, "u").test(all)) problems.push(`the schedule "${name}" of chest.json has no handler in schedules.handle`);
  if (problems.length > 0) throw new Error(problems.join("\n"));
}

// ---- atLeast(n): the test file fails when fewer than n of its tests ran
// (an example's tests removed must not leave a file that passes empty).
export function atLeast(n: number): void {
  let ran = 0;
  beforeEach(() => { ran++; });
  after(() => {
    if (ran < n) throw new Error(`only ${ran} test(s) ran in this file, at least ${n} expected: write the tool's own tests`);
  });
}
