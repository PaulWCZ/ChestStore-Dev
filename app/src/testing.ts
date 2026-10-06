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
//      @electric-sql/pglite and @electric-sql/pglite-socket): 1.2–1.3 GiB
//      more memory — the last resort.
// close() drops what it made.
// The returned sql (to seed, to read back) runs in the Chest's zone as
// db() does (CHEST_TIME_ZONE: current_date is the company's day on both):
// start fakeChest() first — without a zone it warns and uses UTC.
export type TestDatabase = { sql: postgres.Sql; kind: "server" | "preview" | "pglite"; close(): Promise<void> };
const chestShape = /^postgres:\/\/(t_[a-z][a-z0-9_]{0,47}|pb_[a-z2-7]{26}):[^@]+@127\.0\.0\.1:\d+\/\1\?sslmode=disable$/u;
const quiet = { onnotice: () => {} };

// extensions: what the migrations create (unaccent, pg_trgm…), for
// PGlite, which loads each from its own contrib module; a server has them.
// PGlite serves every connection from one session: db() then keeps one
// connection (DATABASE_POOL_MAX=1), so after()'s work and a page's queries
// take turns instead of mixing their transactions — slower, and another
// reason to prefer a server.
export async function testDatabase({ migrations = "migrations", extensions = [] }: { migrations?: string; extensions?: string[] } = {}): Promise<TestDatabase> {
  const files = existsSync(migrations) ? readdirSync(migrations).filter(f => /^\d{4}_[a-z0-9_-]+\.sql$/u.test(f)).sort().map(f => readFileSync(join(migrations, f), "utf8")) : [];
  const name = `t_test_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const given = process.env["CHEST_TIME_ZONE"] ?? "";
  if (!given) console.warn("testDatabase: CHEST_TIME_ZONE is not set — start fakeChest() before testDatabase(), or the seeds' current_date is UTC's day.");
  const zone = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/u.test(given) ? given : "UTC";
  const inZone = { TimeZone: zone };
  const server = process.env["TEST_DATABASE_URL"];
  if (server) {
    const admin = postgres(server, { max: 1, ...quiet });
    const password = Math.random().toString(36).slice(2);
    await admin.unsafe(`create role ${name} login password '${password}'`);
    await admin.unsafe(`create database ${name} owner ${name}`);
    // Every session of it in the Chest's zone (a tool's own pool too).
    await admin.unsafe(`alter database ${name} set timezone = '${zone}'`);
    const base = new URL(server);
    process.env["DATABASE_URL"] = `postgres://${name}:${password}@127.0.0.1:${base.port || 5432}/${name}?sslmode=disable`;
    delete process.env["TEST_DATABASE_SCHEMA"];
    const sql = postgres(process.env["DATABASE_URL"], { max: 2, connection: inZone, ...quiet });
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
    const sql = postgres(preview, { max: 2, connection: { search_path: schema, ...inZone }, ...quiet });
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
  console.warn("testDatabase: no TEST_DATABASE_URL nor preview database — PGlite in this process (1.2–1.3 GiB for a test run). Set TEST_DATABASE_URL to a PostgreSQL server whose user may create roles.");
  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const loaded: Record<string, unknown> = {};
  for (const name of extensions) {
    if (!/^[a-z_][a-z0-9_]*$/u.test(name)) throw new TypeError(`extension ${name}`);
    const module = await import(`@electric-sql/pglite/contrib/${name}`) as Record<string, unknown>;
    loaded[name] = module[name];
  }
  const pg: InstanceType<typeof PGlite> = await (PGlite.create as (options: object) => Promise<InstanceType<typeof PGlite>>)({ extensions: loaded });
  const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 8 });
  await socket.start();
  const port = (socket as unknown as { server: { address(): { port: number } } }).server.address().port;
  process.env["DATABASE_URL"] = `postgres://t_test:test@127.0.0.1:${port}/t_test?sslmode=disable`;
  process.env["DATABASE_POOL_MAX"] = "1";
  delete process.env["TEST_DATABASE_SCHEMA"];
  // One session for every connection: its zone is the Chest's.
  await pg.exec(`set time zone '${zone}'`);
  for (const text of files) await pg.exec(text);
  const sql = postgres(process.env["DATABASE_URL"], { max: 1, connection: inZone, ...quiet });
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
// requireTests (the starter sets it): every src/lib/ module is imported
// by a test file.
export function checkSources({ root = ".", requireTests = false }: { root?: string; requireTests?: boolean } = {}): void {
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
    for (const m of text.matchAll(/className=(?:"([^"]*)"|\{)/gu)) {
      const literals = m[1] !== undefined ? [m[1]] : classLiterals(balanced(text, m.index + m[0].length - 1));
      // A name ending with "-" is a family the code completes
      // (`c-${color}`): some class of the stylesheets must start with it.
      const defined = (name: string) => (name.endsWith("-") ? [...known].some(k => k !== undefined && k.startsWith(name) && k.length > name.length) : known.has(name));
      for (const name of literals.flatMap(l => l.split(/\s+/u)).filter(Boolean)) if (!defined(name)) problems.push(`${file}: the class "${name}" is in no stylesheet (the tool's or the kit's)`);
    }
  }
  const manifest = JSON.parse(readFileSync(join(root, "chest.json"), "utf8")) as { capabilities?: string[]; receives?: string[]; schedules?: { name: string }[]; public?: boolean };
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
  const manifestPublic = (manifest as { public?: boolean }).public === true;
  const code_ = all.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:"'`])\/\/.*$/gmu, "$1");
  // A public action without the public part is dead (the Chest never
  // routes to it) — a page alone may stay (an "open it from your Chest"
  // page). The public part declared with nothing served asks for nothing.
  const publicWrites = /\bpublicAction(sAt)?\(/u.test(code_);
  // Each public action is bounded (bound: { perVisitor, perDay }) or says
  // it needs none (bound: false); with budgets by kind, its run calls
  // charge() (with { subject } for a perSubject one). Read in each
  // publicAction(…) call itself, not in the rest of the file.
  let bounded = false;
  for (const { file, text } of code) {
    const plain = text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:"'`])\/\/.*$/gmu, "$1");
    for (const m of plain.matchAll(/\bpublicAction\(/gu)) {
      const call = balanced(plain, m.index + m[0].length - 1);
      if (!/\bbound\s*:/u.test(call)) problems.push(`${file}: a publicAction without bound — anyone on the Internet may call it: bound: { perVisitor, perDay } (or bound: false)`);
      else if (!/\bbound\s*:\s*false\b/u.test(call)) bounded = true;
      if (/\bbudgets\s*:/u.test(call) && !/\bcharge\(/u.test(call)) problems.push(`${file}: a publicAction with budgets never calls charge(kind): say which budget a call spends, once its request is checked`);
      if (/\bperSubject\s*:/u.test(call) && !/\bcharge\([^)]*\bsubject\b/u.test(call)) problems.push(`${file}: a publicAction with perSubject never says its subject: charge(kind, { subject })`);
    }
  }
  // A bounded action refuses with "limit" and "expired": the catalogues say them.
  if (bounded) {
    for (const file of walk(join(root, "src", "i18n")).filter(f => /\.ts$/u.test(f) && !f.endsWith("index.ts"))) {
      const text = readFileSync(file, "utf8");
      // A catalogue (its errors), not a helper of the folder (format.ts).
      if (!/\berrors\s*:\s*\{/u.test(text)) continue;
      for (const code of ["limit", "expired"]) if (!new RegExp(`\\b${code}\\s*:`, "u").test(text)) problems.push(`${file}: errors.${code} — a bounded public action refuses with it (in this language's words)`);
    }
  }
  const publicPages = /\bpublicPage\(/u.test(code_);
  if (publicWrites && !manifestPublic) problems.push(`src/ has public actions (publicAction) without "public": true in chest.json: the Chest would never route to them`);
  if (manifestPublic && !publicWrites && !publicPages) problems.push(`chest.json asks "public": true and src/ serves no publicPage nor publicAction: remove it`);
  // requireTests: every rule module is imported by a test.
  if (requireTests) {
    const tests = walk(join(root, "test")).filter(f => /\.test\.(m?[jt]s|tsx)$/u.test(f)).map(f => readFileSync(f, "utf8")).join("\n");
    for (const file of walk(join(root, "src", "lib")).filter(f => /\.tsx?$/u.test(f))) {
      const base = file.split(/[/\\]/u).pop()!.replace(/\.tsx?$/u, "");
      if (!new RegExp(`from "[^"]*lib/${base}(\\.tsx?|\\.js)?"`, "u").test(tests)) problems.push(`${file}: no test imports it — a rule without a test`);
    }
  }
  const handlesEvents = /events\.handle\(/u.test(all);
  if ((manifest.receives?.length ?? 0) > 0 && !handlesEvents) problems.push(`chest.json "receives" without events.handle on /chest-events`);
  if ((manifest.receives?.length ?? 0) === 0 && handlesEvents && /"member\.[a-z]+"\s*:/u.test(all)) problems.push(`events handled without "receives": ["member.*"] in chest.json`);
  for (const { name } of manifest.schedules ?? []) if (!new RegExp(`["']?\\b${name}\\b["']?\\s*:`, "u").test(all)) problems.push(`the schedule "${name}" of chest.json has no handler in schedules.handle`);
  if (problems.length > 0) throw new Error(problems.join("\n"));
}

// The text from an opening bracket at `from` to its closing one (strings
// and templates skipped as they come, a template's ${…} read as code).
function balanced(text: string, from: number): string {
  const close: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const stack: string[] = [];
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      i = stringEnd(text, i);
      continue;
    }
    if (close[ch]) stack.push(close[ch]!);
    else if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return text.slice(from, i + 1);
    }
  }
  return text.slice(from);
}
// Where the string opened at `at` ends (its closing quote).
function stringEnd(text: string, at: number): number {
  const quote = text[at]!;
  for (let i = at + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (quote === "`" && text[i] === "$" && text[i + 1] === "{") i += balanced(text, i + 1).length;
    else if (text[i] === quote) return i;
  }
  return text.length;
}

// The literals of a className={…} expression that become class names: the
// strings of ternaries and &&, a template's text, the arguments of cx()/
// clsx()/classNames() and of [...].join(" ") — never the arguments of any
// other call (suggested.has("merchant")) nor a compared value (x === "a").
const classHelpers = new Set(["cx", "clsx", "classNames", "classnames", "join"]);
function classLiterals(expression: string): string[] {
  let text = expression;
  // Calls of anything else: their arguments are not classes.
  for (let at = 0; ;) {
    const m = /([A-Za-z_$][\w$]*)\s*\(/gu;
    m.lastIndex = at;
    const found = m.exec(text);
    if (!found) break;
    const open = found.index + found[0].length - 1;
    const args = balanced(text, open);
    if (classHelpers.has(found[1]!)) at = open + 1;
    else {
      text = text.slice(0, open) + "()" + text.slice(open + args.length);
      at = open + 2;
    }
  }
  // A value compared is not a class.
  text = text.replace(/(===?|!==?)\s*("[^"]*"|'[^']*')|("[^"]*"|'[^']*')\s*(===?|!==?)/gu, "");
  const names: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch !== '"' && ch !== "'" && ch !== "`") continue;
    const end = stringEnd(text, i);
    const body = text.slice(i + 1, end);
    if (ch !== "`") names.push(...body.split(/\s+/u));
    else {
      // A template: its text (a part before ${…} may be a family: "c-"),
      // and the classes of what its ${…} hold.
      let rest = body;
      for (let k = rest.indexOf("${"); k >= 0; k = rest.indexOf("${")) {
        const inner = balanced(rest, k + 1);
        names.push(...rest.slice(0, k).split(/\s+/u));
        names.push(...classLiterals(inner.slice(1, -1)));
        rest = " " + rest.slice(k + 1 + inner.length);
      }
      names.push(...rest.split(/\s+/u));
    }
    i = end;
  }
  return names.filter(Boolean);
}

// ---- settled(): every after() task under way finished (those they start
// too) — then a test reads what they did (a notification, a badge):
//   await call(…); await settled(); assert.equal(chest.notifications.length, 1);
export async function settled(): Promise<void> {
  const pending = (globalThis as Record<symbol, unknown>)[Symbol.for("@argentic/chest-app after")] as Set<Promise<unknown>> | undefined;
  // A task queued by setImmediate is in the set already; one it starts
  // joins while the first are awaited.
  await new Promise(resolve => setImmediate(resolve));
  while (pending && pending.size > 0) await Promise.all([...pending]);
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
