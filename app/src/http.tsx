import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { chest } from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, QuotaExceeded, RateLimited, Unavailable } from "@argentic/chest-sdk/errors";
import { member, type Member } from "@argentic/chest-sdk/member";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import { routePath } from "hono/route";
import type { ComponentType, ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { fill, formatter, localeIn, publicLocale } from "./i18n.ts";
import { setRenderingForm } from "./form.tsx";
import { startRender } from "./island.tsx";
import { log } from "./log.ts";
import type { ErrorCode, LayoutData, Words } from "./register.ts";
import { AppError, fail, HttpStatus, readInput, toolPath, type Action, type Bound, type Budget, type Cookies, type MemberContext, type VisitorContext } from "./tool.ts";

// The server of a tool: security headers and a log line on every answer,
// the browser's files under /assets/, the member of every /chest request,
// the actions, the pages, the error pages, the language switch.

// The policy of every answer: the tool's own files only. No inline script,
// no inline style (no style="" either): the Chest's default policy for a
// public part is the same, so the tool needs no "csp" permission.
export const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

// Who reads a page: a member (on /chest) or a visitor.
export type Viewer = MemberContext | VisitorContext;
// What a page handler gets, and gives back (or a Response of its own).
export type PageContext<V extends Viewer = MemberContext> = V & { url: URL; param(name: string): string; query(name: string): string | undefined };
// locale: a public page in a language of its own, one of the tool's (a
// request's page in the request's language): <html lang> and the layout's
// words follow it. A member's page is in the member's language.
// head: more in the <head> of this page (robots, a feed's link); exactTitle:
// the title as given, without " · <tool>" (a public page in the company's
// name).
// layout: what this page tells the layout around it (the nav's state it
// found while reading — a tab shown, a count), as LayoutProps.data; its
// shape is the tool's Register's layout.
export type View = { title: string; body: ReactNode; locale?: string; head?: ReactNode; exactTitle?: boolean; layout?: Partial<LayoutData> };
// What a layout gets: the viewer, the path, a refusal of a form sent
// without JavaScript (notice), the page.
// look: the request's look when createApp has one (its logo, in brand
// mode); status: the page's (an error page's layout may draw more frame).
// data: what the page told it (View.layout; {} on an error page).
export type LayoutProps<V extends Viewer> = { viewer: V; path: string; notice: string | null; look: Look | null; status: number; data: Partial<LayoutData>; children: ReactNode };
// A look served as a stylesheet of its own (/chest/look.css, /look.css),
// for a look that depends on the request; the browser bar's colours.
// logo: the company's (brand mode), for the layout to show.
export type Look = { css: string; colors?: readonly { media: string; color: string }[]; logo?: { url: string; alt: string; dark?: string | null } | null };

export type AppOptions = {
  // The tool's actions (src/actions.ts) and islands (src/islands/index.ts).
  actions: Record<string, Action>;
  islands: Record<string, ComponentType<never>>;
  // Its languages (the first is the source and fallback) and its words.
  locales: readonly string[];
  words: (locale: string) => Words;
  // What goes around every page (src/layout.tsx).
  layouts: { members: ComponentType<LayoutProps<MemberContext>>; public: ComponentType<LayoutProps<VisitorContext>> };
  // More in the <head> of every page (an icon, a description).
  head?: (viewer: Viewer) => ReactNode;
  // A look that depends on the request (the Chest's theme choice, when an
  // SDK gives it); without it, the look is built into client.css.
  look?: (viewer: Viewer) => Look | Promise<Look>;
  // What the tool adds to the member the Chest asserts, once per /chest
  // request before any page or action reads it (more about the same
  // person — every group they are in —, never another identity). Not run
  // for /assets/ nor the look. A hook that asks the Chest (members.groups…)
  // must cache its answer a minute: the members API allows 600 calls a
  // minute for the whole tool.
  complete?: (who: Member) => Promise<Member>;
};

type Env = { Variables: { viewer: MemberContext; app: AppOptions } };
// A file the build names by its content (client-<hash>.js, a chunk).
const hashed = /^\/assets\/[\w.-]+-[\w-]{8}\.js$/u;
const firstSegment = (path: string) => path.split("/")[1]?.toLowerCase() ?? "";
const isMembers = (path: string) => firstSegment(path) === "chest";

// Each app keeps its options on its requests (two apps in one process
// never share them).
const optionsOf = (c: Context): AppOptions => (c as Context<Env>).get("app");

function cookiesOf(c: Context): Cookies {
  return {
    get: name => getCookie(c, name),
    set: (name, value, o) => setCookie(c, name, value, { path: o.path, maxAge: o.maxAge, sameSite: "Lax", secure: true, httpOnly: true }),
  };
}
function visitor(c: Context): VisitorContext {
  const options = optionsOf(c);
  const locale = publicLocale(options.locales, getCookie(c, "lang"), c.req.header("accept-language"), chest.language);
  return { member: null, locale, t: options.words(locale), f: formatter(locale, chest.timeZone, chest.currency), request: c.req.raw, cookies: cookiesOf(c) };
}
const viewerOf = (c: Context<Env>): Viewer => (isMembers(c.req.path) && c.get("viewer")) || visitor(c);

// The browser's files. The script is named by its content's hash
// (client-<hash>.js, vite.ts): a chunk loaded later by an island's
// import() imports it under that very name, so the entry — React with
// it — runs once (a "?v=" on the page's link would be another URL, and a
// second React). The stylesheet is linked with the build's time (?v=…).
// A new build is fetched at once, an unchanged one comes from the cache.
// Read once at start; on every page in development (npm run dev rebuilds).
const assets = "dist/client/assets";
let built: { script: string; version: string } | undefined;
function browserFiles(): { script: string; version: string } {
  if (built && process.env["NODE_ENV"] !== "development") return built;
  try {
    // The newest entry (a watching build leaves the earlier ones).
    const script = readdirSync(assets).filter(f => /^client-[\w-]+\.js$/u.test(f)).map(f => ({ f, at: statSync(`${assets}/${f}`).mtimeMs })).sort((a, b) => b.at - a.at)[0]?.f ?? "client.js";
    built = { script, version: Math.round(statSync(`${assets}/client.css`).mtimeMs).toString(36) };
  } catch {
    built = { script: "client.js", version: "none" };
  }
  return built;
}

// A refusal of a form sent without JavaScript comes back in the address:
// ?error=too_long&values={"max":2000}.
function noticeOf(c: Context, t: Words): string | null {
  const code = c.req.query("error");
  if (!code || !Object.hasOwn(t.errors, code)) return null;
  let values: Record<string, string | number> = {};
  try {
    const raw = JSON.parse(c.req.query("values") ?? "{}") as unknown;
    // Numbers only: a value in the address is anyone's to write.
    if (raw && typeof raw === "object") values = Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^\w{1,32}$/u.test(k) && typeof v === "number" && Number.isFinite(v)));
  } catch { /* no values */ }
  const said = fill(sayError(t, code), values);
  // A value missing (an address written by hand): the plain refusal.
  return /\{\w+\}/u.test(said) ? t.errors.invalid : said;
}

async function html(c: Context, view: View, viewer: Viewer, status: 200 | 400 | 401 | 403 | 404 | 500 = 200) {
  const options = optionsOf(c);
  const { script, version: v } = browserFiles();
  const look = options.look ? await options.look(viewer) : null;
  const lookTag = look ? createHash("sha256").update(look.css).digest("base64url").slice(0, 16) : "";
  const name = viewer.t.tool.name;
  const notice = noticeOf(c, viewer.t);
  const { members: Members, public: Public } = options.layouts;
  startRender(options.islands);
  // A public page of a tool with bounded actions carries a form token
  // (<Honeypot /> puts it in a form; call() sends it).
  const form = viewer.member === null && hasBounds(options) ? formToken() : "";
  // The actions call() sends at once (beside the queue): this part's.
  const parallel = Object.entries(options.actions).filter(([, a]) => a.parallel && a.access === (viewer.member !== null ? "member" : "public")).map(([name]) => name);
  setRenderingForm(form);
  const page = renderToString(
    <html lang={viewer.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{view.title === name || view.exactTitle ? view.title : `${view.title} · ${name}`}</title>
        {look?.colors?.map(m => <meta key={m.media} name="theme-color" media={m.media} content={m.color} />)}
        {options.head?.(viewer)}
        {view.head}
        {form && <meta name="chest-form" content={form} />}
        {parallel.length > 0 && <meta name="chest-parallel" content={parallel.join(",")} />}
        <link rel="stylesheet" href={`/assets/client.css?v=${v}`} />
        {look && <link rel="stylesheet" href={`${viewer.member !== null ? "/chest" : ""}/look.css?v=${lookTag}`} />}
        <script type="module" src={`/assets/${script}`} />
      </head>
      <body>
        {viewer.member !== null
          ? <Members viewer={viewer} path={c.req.path} notice={notice} look={look} status={status} data={view.layout ?? {}}>{view.body}</Members>
          : <Public viewer={viewer} path={c.req.path} notice={notice} look={look} status={status} data={view.layout ?? {}}>{view.body}</Public>}
      </body>
    </html>,
  );
  return c.html("<!doctype html>" + page, status);
}

// An error page in the reader's words; a member is offered the way back
// to the tool's first page (a visitor has no way into the Chest).
function errorView(viewer: Viewer, status: 403 | 404 | 500): View {
  const t = viewer.t;
  const words = status === 403 ? t.pages.forbidden : status === 404 ? t.pages.notFound : t.pages.failed;
  // A visitor's 404 may say more (a link turned off): pages.notFound.publicBody.
  const body = status === 404 && viewer.member === null ? t.pages.notFound.publicBody ?? words.body : words.body;
  return {
    title: words.title,
    body: (
      <div className="ck-empty">
        <h1 className="ck-empty-title">{words.title}</h1>
        <p className="ck-empty-body">{body}</p>
        {viewer.member !== null && <div className="ck-empty-actions"><a className="ck-button ck-button-quiet" href="/chest">{t.pages.back}</a></div>}
      </div>
    ),
  };
}

function contextOf<V extends Viewer>(c: Context, viewer: V): PageContext<V> {
  return { ...viewer, url: new URL(c.req.url), param: name => c.req.param(name) ?? "", query: name => c.req.query(name) };
}

// download(): a file of the members' part (/chest/…/export.csv) — the
// handler returns { name, type, body } (a string, bytes or a stream: a
// csv built line by line, zipStream()), or a Response of its own. Sent as
// an attachment, never cached. A refusal (fail("forbidden"), "invalid"
// with its values…) is a page in the reader's words with its status (403,
// 400, 404) — what the person sees when the link does not give a file.
// publicDownload(): the same for the public part.
export type Download = { name: string; type: string; body: BodyInit | ReadableStream<Uint8Array> };
const attachment = (file: Download) => new Response(file.body, {
  headers: {
    "Content-Type": file.type,
    "Content-Disposition": `attachment; filename="${file.name.replace(/[^\x20-\x7e]|["\\]/gu, "_")}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    "Cache-Control": "no-store",
  },
});
async function served(c: Context, viewer: Viewer, run: () => Promise<Download | Response> | Download | Response): Promise<Response> {
  try {
    const file = await run();
    return file instanceof Response ? file : attachment(file);
  } catch (error) {
    if (!(error instanceof AppError) || error.code === "unavailable" || error.code === "unknown") throw error;
    const status = error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : 400;
    const t = viewer.t;
    const title = status === 403 ? t.pages.forbidden.title : status === 404 ? t.pages.notFound.title : t.pages.failed.title;
    const said = fill(sayError(t, error.code), error.values);
    return html(c, {
      title,
      body: (
        <div className="ck-empty">
          <h1 className="ck-empty-title">{title}</h1>
          <p className="ck-empty-body">{said}</p>
          {viewer.member !== null && <div className="ck-empty-actions"><a className="ck-button ck-button-quiet" href="/chest">{t.pages.back}</a></div>}
        </div>
      ),
    }, viewer, status);
  }
}
export const download = (render: (p: PageContext<MemberContext>) => Promise<Download | Response> | Download | Response) => async (c: Context<Env>) =>
  served(c, c.get("viewer"), () => render(contextOf(c, c.get("viewer"))));
export const publicDownload = (render: (p: PageContext<VisitorContext>) => Promise<Download | Response> | Download | Response) => async (c: Context) => {
  const viewer = visitor(c);
  return served(c, viewer, () => render(contextOf(c, viewer)));
};

// page(): a page of the members' part (under /chest); publicPage(): one of
// the public part. The handler reads what the page needs and returns its
// title and body (the layout goes around), or a Response of its own.
export const page = (render: (p: PageContext<MemberContext>) => Promise<View | Response> | View | Response) => async (c: Context<Env>) => {
  const view = await render(contextOf(c, c.get("viewer")));
  return view instanceof Response ? view : html(c, view, c.get("viewer"));
};
export const publicPage = (render: (p: PageContext<VisitorContext>) => Promise<View | Response> | View | Response) => async (c: Context) => {
  const viewer = visitor(c);
  const view = await render(contextOf(c, viewer));
  return view instanceof Response ? view : html(c, view, speaking(c, viewer, view.locale));
};
// The visitor, in the page's own language when it names one the tool speaks.
function speaking(c: Context, viewer: VisitorContext, locale: string | undefined): VisitorContext {
  const options = optionsOf(c);
  if (!locale || locale === viewer.locale || !options.locales.includes(locale)) return viewer;
  return { ...viewer, locale, t: options.words(locale), f: formatter(locale, chest.timeZone, chest.currency) };
}

// A mutation is sent by the page itself: the browser says so
// (Sec-Fetch-Site), or, for an older one, its Origin is this host.
export function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  try {
    return origin !== null && new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

// The page the form was sent from (same host, same part), to go back to.
function back(c: Context, members: boolean, error?: ErrorCode, values?: Record<string, string | number>): string {
  let to = members ? "/chest" : "/";
  try {
    const from = new URL(c.req.header("referer") ?? "");
    const path = toolPath(from.pathname + from.search);
    if (from.host === c.req.header("host") && path !== null && isMembers(from.pathname) === members) {
      const url = new URL(path, "https://tool.invalid");
      url.searchParams.delete("error");
      url.searchParams.delete("values");
      to = url.pathname + url.search;
    }
  } catch { /* no referer: the part's first page */ }
  if (!error) return to;
  const query = new URLSearchParams({ error, ...(values && Object.keys(values).length > 0 ? { values: JSON.stringify(values) } : {}) });
  return to + (to.includes("?") ? "&" : "?") + query.toString();
}

const chestDown = (e: unknown) => e instanceof Unavailable || e instanceof RateLimited || e instanceof QuotaExceeded || e instanceof CapabilityNotGranted;

// POST /chest/actions/<name> (members) and /actions/<name> (visitors).
// Fetched (call(), an enhanced form: x-tool-action: 1): JSON. A plain
// form: a redirect back (303).
async function runAction(c: Context<Env>, members: boolean): Promise<Response> {
  const options = optionsOf(c);
  const name = c.req.param("name") ?? "";
  const definition = Object.hasOwn(options.actions, name) ? options.actions[name] : undefined;
  const viewer = members ? c.get("viewer") : visitor(c);
  const fetched = c.req.header("x-tool-action") === "1";
  let renew: Record<string, string> = {};
  const refuse = (status: 400 | 403 | 404 | 413 | 415 | 429 | 500, code: ErrorCode, values?: Record<string, string | number>) =>
    fetched ? c.json({ ok: false, error: code, message: fill(sayError(viewer.t, code), values), ...renew }, status) : c.redirect(back(c, members, code, values), 303);
  if (!sameOrigin(c.req.raw)) return fetched ? refuse(403, "forbidden") : c.text("Cross-site request refused.", 403);
  if (!definition || definition.access !== (members ? "member" : "public")) return refuse(404, "not_found");
  const type = c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const json = type === "application/json";
  if (json && !fetched) return c.text("Cross-site request refused.", 403);
  // What a form or call() sends, nothing else (no error logged: anyone may
  // post anything to a public action).
  if (!json && type !== "application/x-www-form-urlencoded" && type !== "multipart/form-data") return refuse(415, "invalid");
  let answer: Response | undefined;
  const bound = definition.access === "public" ? definition.bound ?? false : false;
  // A bounded action's answer brings the next form token (the one sent
  // served once).
  const next = bound ? { form: formToken() } : {};
  renew = next;
  const ok = (value: unknown) => (fetched ? c.json({ ok: true, value: value ?? null, ...next }) : c.redirect(back(c, members), 303));
  const refused = await bodyLimit({ maxSize: definition.maxBody, onError: () => refuse(413, "too_large") })(c, async () => {
    try {
      const raw = json ? await c.req.json<Record<string, unknown>>() : formFields(await c.req.formData());
      let spent: Spent | null = null;
      let charged = false;
      const charge = async (kind: string, options: { subject?: string } = {}) => {
        if (!bound || !("budgets" in bound) || !Object.hasOwn(bound.budgets, kind)) throw new Error(`charge("${kind}"): ${name} has no such budget`);
        if (charged) throw new Error(`charge(): ${name} spends one budget a call`);
        const budget = bound.budgets[kind]!;
        if (budget.perSubject !== undefined && !options.subject) throw new Error(`charge("${kind}"): its budget has perSubject — say the subject: charge("${kind}", { subject })`);
        charged = true;
        spent = await spend(c, `${name}:${kind}`, budget, options.subject ?? null, spent);
      };
      try {
        if (bound) {
          // A robot filled the field people never see: "done", nothing done.
          if (typeof raw?.["website"] === "string" && raw["website"] !== "") {
            answer = ok(null);
            return;
          }
          // The token is spent whatever follows (a refusal's answer, or the
          // page it goes back to, brings the next one).
          await takeForm(c.req.header("x-chest-form") ?? raw?.["chest_form"], bound.formMinutes ?? 120, Math.min(bound.formSeconds ?? 0, 30));
          // Refusals have a budget of their own (ten times the day's): a
          // run's checks may ask the Chest, and a flood of calls refused
          // one by one must not spend the Chest's limits for the tool.
          await refusalsLeft(name, bound);
        }
        const input = readInput(definition.input, raw !== null && typeof raw === "object" ? raw : {});
        if (bound && !("budgets" in bound)) spent = await spend(c, name, bound, null, spent);
        const value = await definition.run(input as never, { ...viewer, cookies: cookiesOf(c), request: c.req.raw, ...(definition.access === "public" ? { charge } : {}) } as never);
        if (bound && "budgets" in bound && !charged) {
          // Written without a budget: a bug of the tool's, said loudly.
          log.error("public action ran without charge()", new Error("charge() not called"), { action: name });
          if (process.env.NODE_ENV === "development") throw new Error(`${name}: a public action with budgets must call charge(kind)`);
        }
        answer = ok(value);
      } catch (error) {
        // Refused or failed (a redirect is done): its counts given back, and
        // a refusal counted with the refusals.
        if (!(error instanceof HttpStatus && error.to)) {
          await (spent as Spent | null)?.release();
          if (bound && (error instanceof AppError || error instanceof HttpStatus) && !(error instanceof AppError && (error.code === "limit" || error.code === "expired"))) await countRefusal(name);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof HttpStatus && error.to) answer = fetched ? c.json({ ok: true, value: null, redirect: error.to, ...next }) : c.redirect(error.to, 303);
      else if (error instanceof HttpStatus) answer = refuse(error.status === 403 ? 403 : 404, error.status === 403 ? "forbidden" : "not_found");
      else if (error instanceof AppError) answer = refuse(error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : error.code === "limit" ? 429 : 400, error.code, error.values);
      else if (error instanceof SyntaxError || (error instanceof TypeError && /form|body|parse/iu.test(error.message))) answer = refuse(400, "invalid");
      else if (chestDown(error)) {
        log.warn("the Chest did not answer", { action: name, error: (error as Error).name });
        answer = refuse(500, "unavailable");
      } else {
        log.error("action failed", error, { action: name });
        answer = refuse(500, "unknown");
      }
    }
  });
  return refused ?? answer ?? refuse(500, "unknown");
}

// ---- Public actions' bounds (tool.ts, publicAction, says what and why).
const hasBounds = (options: AppOptions) => Object.values(options.actions).some(a => a.access === "public" && a.bound);

// What a call took (its form token, its counts), given back when it fails.
type Spent = { release(): Promise<void> };
const chain = (first: Spent | null, then: () => Promise<void>): Spent => ({ release: async () => { await then(); await first?.release(); } });

// A form token: "<ms>.<nonce>.<signature>", the signature under a key
// derived from CHEST_TOKEN (never sent anywhere).
function formKey(): Buffer {
  const token = process.env["CHEST_TOKEN"];
  if (!token) throw new Error("CHEST_TOKEN is not set");
  return createHmac("sha256", token).update("chest-app form token 1 " + (process.env["CHEST_TOOL"] ?? "")).digest();
}
const formSignature = (value: string) => createHmac("sha256", formKey()).update(value).digest("base64url");
// formToken(): a fresh token, as a public page carries (a test that calls
// a bounded action sends one: { chest_form: formToken() }).
export function formToken(now = Date.now()): string {
  const value = `${Math.floor(now)}.${randomBytes(12).toString("base64url")}`;
  return `${value}.${formSignature(value)}`;
}
// A token ours, younger than its minutes and never served: taken (in
// chest_seen) until the call fails. Otherwise "expired".
async function takeForm(token: unknown, minutes: number, seconds: number): Promise<void> {
  const parts = typeof token === "string" && token.length <= 128 ? token.split(".") : [];
  const [time = "", nonce = "", signature = ""] = parts;
  const expected = parts.length === 3 && /^\d{13}$/u.test(time) ? formSignature(`${time}.${nonce}`) : "";
  const age = Date.now() - Number(time);
  if (!expected || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) || age < -60_000 || age > minutes * 60_000) fail("expired" as ErrorCode);
  // Sent sooner than a person fills it: the seconds left, waited.
  if (age < seconds * 1000) await new Promise(resolve => setTimeout(resolve, seconds * 1000 - Math.max(0, age)));
  const { db } = await import("./db.ts");
  const sql = db();
  const id = `form:${nonce}`;
  if ((await sql`insert into chest_seen (id) values (${id}) on conflict do nothing returning id`).length === 0) fail("expired" as ErrorCode);
  if (Math.random() < 0.02) await sql`delete from chest_seen where id like 'form:%' and at < now() - interval '2 days'`;
}

// The refusals of a public action today, for everyone: at most ten times
// its day's budget (the sum of its kinds'), then "limit" before its run.
const refusalCeiling = (bound: Bound) => 10 * ("budgets" in bound ? Object.values(bound.budgets).reduce((n, b) => n + b.perDay, 0) : bound.perDay);
async function refusalsLeft(name: string, bound: Bound): Promise<void> {
  const { db } = await import("./db.ts");
  const [row] = await db()<{ count: number }[]>`select count from chest_bounds where scope = ${name + ":refused"} and visitor = '*' and day = current_date`;
  if ((row?.count ?? 0) >= refusalCeiling(bound)) fail("limit" as ErrorCode);
}
async function countRefusal(name: string): Promise<void> {
  const { db } = await import("./db.ts");
  await db()`insert into chest_bounds (scope, visitor, day, count) values (${name + ":refused"}, '*', current_date, 1)
    on conflict (scope, visitor, day) do update set count = chest_bounds.count + 1`;
}

// The visitor a budget counts: the address the Chest's front gives
// (Chest-Visitor-Address: the client cannot send a Chest-* header, the
// front removes them), else this browser's cookie (set at its first call);
// null for one with neither — counted with everyone only.
function visitorKey(c: Context): string | null {
  const address = (c.req.header("chest-visitor-address") ?? "").trim();
  if (/^[0-9a-fA-F:.]{2,45}$/u.test(address) && /[.:]/u.test(address)) return "a:" + createHash("sha256").update(address).digest("base64url").slice(0, 22);
  const cookie = getCookie(c, "chest_v");
  if (cookie && /^[\w-]{16,64}$/u.test(cookie)) return "c:" + cookie;
  setCookie(c, "chest_v", randomBytes(18).toString("base64url"), { path: "/", maxAge: 365 * 86_400, sameSite: "Lax", secure: true, httpOnly: true });
  return null;
}

// One more in a budget, today (the Chest's day), for this visitor, for
// the subject (perSubject: a guest link, a booking) and for everyone, in
// chest_bounds; past any, refused ("limit") and not kept. A visitor who
// already wrote today (known by address or cookie) keeps a reserve past
// everyone's ceiling — a tenth of it, at least one —, so a flood of new
// visitors does not lock out the people already in a conversation.
const reserveOf = (budget: Budget) => Math.max(1, Math.ceil(budget.perDay / 10));
async function spend(c: Context, scope: string, budget: Budget, subject: string | null, before: Spent | null): Promise<Spent> {
  const { db } = await import("./db.ts");
  const sql = db();
  const who = visitorKey(c);
  const add = async (key: string, by: number) => (await sql<{ count: number }[]>`
    insert into chest_bounds (scope, visitor, day, count) values (${scope}, ${key}, current_date, ${by})
    on conflict (scope, visitor, day) do update set count = chest_bounds.count + ${by} returning count`)[0]!.count;
  const taken: string[] = [];
  const release = async () => { for (const key of taken) await add(key, -1); };
  const over = async (key: string, limit: number) => {
    taken.push(key);
    const count = await add(key, 1);
    if (count > limit) {
      await release();
      fail("limit" as ErrorCode);
    }
    return count;
  };
  const known = who === null ? 0 : await over(who, budget.perVisitor);
  if (subject !== null && budget.perSubject !== undefined) await over("s:" + createHash("sha256").update(subject).digest("base64url").slice(0, 22), budget.perSubject);
  await over("*", budget.perDay + (known > 1 ? reserveOf(budget) : 0));
  if (Math.random() < 0.02) await sql`delete from chest_bounds where day < current_date - 1`;
  return chain(before, release);
}

// A form's fields; a name sent several times (checkboxes) is a list.
function formFields(data: FormData): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const name of new Set(data.keys())) {
    const all = data.getAll(name).filter((v): v is string => typeof v === "string");
    fields[name] = all.length > 1 ? all : all[0];
  }
  return fields;
}

// The look's stylesheet: linked with ?v=<its hash> it never changes (a
// new look is a new address); without, revalidated by its ETag.
// A refusal's sentence: the catalogue's; an optional code it does not say
// falls back to the nearest it must say ("amount_ambiguous" → "invalid").
function sayError(t: Words, code: string): string {
  const errors = t.errors as Record<string, string | undefined>;
  return errors[code] ?? (code === "amount_ambiguous" ? t.errors.invalid : t.errors.unavailable);
}

// If-None-Match against a tag, weakly (W/"x" and "x" are the same).
function weakMatch(header: string | undefined, tag: string): boolean {
  if (!header) return false;
  const strip = (t: string) => t.trim().replace(/^W\//u, "");
  return header.split(",").some(t => t.trim() === "*" || strip(t) === strip(tag));
}

function stylesheet(c: Context, css: string) {
  const hash = createHash("sha256").update(css).digest("base64url");
  const tag = `"${hash.slice(0, 27)}"`;
  c.header("ETag", tag);
  c.header("Cache-Control", c.req.query("v") === hash.slice(0, 16) ? "private, max-age=31536000, immutable" : "private, no-cache");
  // Compared weakly: gzipped on its way, the tag becomes W/"…".
  if (weakMatch(c.req.header("if-none-match"), tag)) return c.body(null, 304);
  c.header("Content-Type", "text/css; charset=utf-8");
  return c.body(css);
}

// publicActionsAt(): the public actions also answered under a path of the
// tool's — app.post("/p/:link/actions/:name", publicActionsAt()) — so a
// cookie kept for that path only (a guest's secret for one poll) reaches
// them. call(name, input, { at: "/p/abc" }) sends there.
export const publicActionsAt = () => (c: Context<Env>) => runAction(c, false);

// gzip from 1 KiB, measured: a page or JSON (c.html, c.json) has no
// Content-Length, so the body's first KiB is read before choosing — a
// short answer goes as it is, a long one (a stream too) gzipped as it goes.
const compressible = /^(text\/|application\/(json|javascript|xml|[\w.+-]*\+(json|xml))|image\/svg\+xml)/u;
async function gzip(c: Context, next: () => Promise<void>): Promise<void> {
  await next();
  const res = c.res;
  if (!res.body || c.req.method === "HEAD" || res.status === 204 || res.status === 304 || res.headers.has("Content-Encoding") || !compressible.test(res.headers.get("Content-Type") ?? "")) return;
  const vary = () => { if (!/accept-encoding/iu.test(c.res.headers.get("Vary") ?? "")) c.res.headers.append("Vary", "Accept-Encoding"); };
  const length = res.headers.get("Content-Length");
  if (!/\bgzip\b/u.test(c.req.header("Accept-Encoding") ?? "") || (length !== null && Number(length) < 1024)) return vary();
  const reader = res.body.getReader();
  const head: Uint8Array[] = [];
  let size = 0;
  let ended = false;
  while (size < 1024) {
    const read = await reader.read();
    if (read.done) {
      ended = true;
      break;
    }
    head.push(read.value);
    size += read.value.byteLength;
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of head) controller.enqueue(chunk);
      if (ended) controller.close();
    },
    async pull(controller) {
      const read = await reader.read();
      if (read.done) controller.close();
      else controller.enqueue(read.value);
    },
    cancel: reason => reader.cancel(reason),
  });
  if (ended && size < 1024) {
    c.res = new Response(body, res);
    return vary();
  }
  c.res = new Response(body.pipeThrough(new CompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>), res);
  c.res.headers.delete("Content-Length");
  c.res.headers.set("Content-Encoding", "gzip");
  const tag = c.res.headers.get("ETag");
  if (tag && !tag.startsWith("W/")) c.res.headers.set("ETag", `W/${tag}`);
  vary();
}

export function createApp(options: AppOptions) {
  const app = new Hono<Env>();
  app.use(async (c, next) => {
    c.set("app", options);
    await next();
  });

  // Every answer: the policy, the headers that go with it, a log line.
  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    // A route that answers with its own policy keeps it (a banner other
    // sites may frame: its frame-ancestors; a picture: a stricter one), and
    // its own Referrer-Policy (a page whose address holds a secret:
    // no-referrer). Pages and actions never set one: they get this.
    if (!c.res.headers.has("Content-Security-Policy")) c.header("Content-Security-Policy", policy);
    c.header("X-Content-Type-Options", "nosniff");
    if (!c.res.headers.has("Referrer-Policy")) c.header("Referrer-Policy", "same-origin");
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
    // The route's pattern (/p/:link/actions/:name), never the path or the
    // query: an address may carry a secret (a guest's link, a token), and
    // the log is kept 7 days. An action is named (a name of the code).
    if (!c.req.path.startsWith("/assets/") || c.res.status >= 400) {
      const route = routePath(c, -1);
      const name = c.req.param("name");
      log.info("request", { method: c.req.method, route: route && route !== "*" && route !== "/*" ? route : "(none)", action: route.endsWith("/actions/:name") && name && Object.hasOwn(options.actions, name) ? name : undefined, status: c.res.status, ms: Math.round(performance.now() - started) });
    }
  });

  // Pages, JSON and downloads of 1 KiB and more, gzipped as they are sent
  // (the Chest's front does not compress); the browser's files are
  // compressed at build (chestConfig) and served as they are.
  app.use(async (c, next) => (c.req.path.startsWith("/assets/") ? next() : gzip(c, next)));

  // A link the browser follows in place (navigate(): x-tool-navigate) that
  // leads to a file: 204, its body never sent (a stream cancelled at its
  // start), and the browser then loads it plainly — the file made once.
  app.use(async (c, next) => {
    await next();
    if (c.req.header("x-tool-navigate") !== "1" || c.req.method !== "GET" || c.res.status !== 200) return;
    if ((c.res.headers.get("Content-Type") ?? "").startsWith("text/html")) return;
    await c.res.body?.cancel().catch(() => undefined);
    c.res = new Response(null, { status: 204, headers: { "x-tool-file": "1", "Cache-Control": "no-store" } });
    c.res.headers.delete("Content-Type");
    c.res.headers.delete("Content-Disposition");
    c.res.headers.delete("Content-Length");
  });

  // The browser's files (dist/client/assets, from src/ and public/assets/):
  // linked with ?v=…, or named by their hash (the script, its chunks),
  // they never change; any other, an hour.
  // (Set once the file is served: a header set in serveStatic's onFound
  // never reached the browser — the files went out "no-store".)
  // A file without a name that changes (an icon, a font) has its ETag and
  // Last-Modified, answered 304 when the browser has it; every file says
  // Vary: Accept-Encoding (a .br or .gz may be served for it).
  app.use("/assets/*", async (c, next) => {
    const forever = Boolean(c.req.query("v")) || hashed.test(c.req.path);
    let tag: string | null = null;
    let modified: Date | null = null;
    if (!forever && !c.req.path.includes("..")) {
      try {
        const stat = statSync(join("dist/client", c.req.path));
        if (stat.isFile()) {
          tag = `W/"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`;
          modified = stat.mtime;
        }
      } catch { /* not there: serveStatic's 404 */ }
      if (tag && weakMatch(c.req.header("if-none-match"), tag)) return c.body(null, 304, { ETag: tag, "Cache-Control": "public, max-age=3600", Vary: "Accept-Encoding" });
    }
    await next();
    if (!c.res.ok) return;
    c.res.headers.set("Cache-Control", forever ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    if (!/accept-encoding/iu.test(c.res.headers.get("Vary") ?? "")) c.res.headers.append("Vary", "Accept-Encoding");
    if (tag && modified) {
      c.res.headers.set("ETag", tag);
      c.res.headers.set("Last-Modified", modified.toUTCString());
    }
  }, serveStatic({ root: "./dist/client", precompressed: true }));

  // The members' part: the Chest asserts who asks on every request
  // (member(): the only source of identity); without it, 401.
  app.use(async (c, next) => {
    if (!isMembers(c.req.path)) return next();
    const asserted = member(c.req.raw);
    if (!asserted) return c.text(visitor(c).t.pages.signIn, 401);
    // complete() is skipped where nothing reads more than the assertion.
    const who = options.complete && c.req.path !== "/chest/look.css" ? await options.complete(asserted) : asserted;
    const locale = localeIn(options.locales, who.language);
    c.set("viewer", { member: who, locale, t: options.words(locale), f: formatter(locale, who.timeZone, chest.currency), request: c.req.raw, cookies: cookiesOf(c) });
    return next();
  });

  // The public part's language switch: the choice kept a year, then back.
  app.get("/lang/:code", c => {
    const code = c.req.param("code");
    if (options.locales.includes(code)) setCookie(c, "lang", code, { path: "/", maxAge: 365 * 86_400, sameSite: "Lax", secure: true, httpOnly: true });
    const to = toolPath(c.req.query("back"));
    return c.redirect(to !== null && !isMembers(to) ? to : "/", 303);
  });

  app.post("/chest/actions/:name", c => runAction(c, true));
  app.post("/actions/:name", c => runAction(c, false));

  if (options.look) {
    const look = options.look;
    app.get("/chest/look.css", async c => stylesheet(c, (await look(c.get("viewer"))).css));
    app.get("/look.css", async c => stylesheet(c, (await look(visitor(c))).css));
  }

  app.notFound(c => html(c, errorView(viewerOf(c), 404), viewerOf(c), 404));
  app.onError((error, c) => {
    if (error instanceof HttpStatus && error.to) return c.redirect(error.to, c.req.method === "GET" ? 302 : 303);
    if (error instanceof HttpStatus) return html(c, errorView(viewerOf(c), error.status === 403 ? 403 : 404), viewerOf(c), error.status === 403 ? 403 : 404);
    // fail() in a page: forbidden is 403, any other refusal 404 (the page
    // cannot be shown as asked) — never a 500.
    if (error instanceof AppError) return html(c, errorView(viewerOf(c), error.code === "forbidden" ? 403 : 404), viewerOf(c), error.code === "forbidden" ? 403 : 404);
    if (chestDown(error)) log.warn("the Chest did not answer", { route: routePath(c, -1), error: error.name });
    else {
      const route = routePath(c, -1);
      log.error(route === "/chest-schedules" ? "schedule failed" : route === "/chest-events" ? "event failed" : "page failed", error, { route });
    }
    return html(c, errorView(viewerOf(c), 500), viewerOf(c), 500);
  });
  return app;
}

// rawRoute(): a POST that takes its body as bytes (an import, a file the
// tool keeps itself), bounded and same-origin like an action:
//   app.post("/chest/import", rawRoute({ maxBytes: 20 << 20 }, async (body, { viewer }) => …))
// The body is counted while it is read — a chunked one without
// Content-Length too — and refused with 413 past maxBytes; a cross-site
// request is refused with 403. viewer: the member on /chest, the visitor
// elsewhere. The handler answers a Response (c.json(…), a redirect…).
export function rawRoute(options: { maxBytes: number }, handler: (body: Uint8Array, context: { viewer: Viewer; c: Context }) => Response | Promise<Response>) {
  return async (c: Context<Env>) => {
    if (!sameOrigin(c.req.raw)) return c.text("Cross-site request refused.", 403);
    const declared = Number(c.req.header("content-length") ?? NaN);
    if (Number.isFinite(declared) && declared > options.maxBytes) return c.text("Too large.", 413);
    // With a Content-Length (a browser's upload has one), the body is read
    // straight into one buffer of that size: the tool holds it once, never
    // twice (chunks, then their copy) — a 40 MB import is 40 MB, not 80.
    // A body longer than it said is refused; a chunked one is gathered.
    const reader = c.req.raw.body?.getReader();
    if (Number.isFinite(declared) && declared >= 0) {
      const body = new Uint8Array(declared);
      let at = 0;
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        if (at + value.byteLength > declared) {
          await reader.cancel();
          return c.text("The body is longer than its Content-Length.", 400);
        }
        body.set(value, at);
        at += value.byteLength;
      }
      return handler(at === declared ? body : body.subarray(0, at), { viewer: viewerOf(c), c });
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > options.maxBytes) {
        await reader.cancel();
        return c.text("Too large.", 413);
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      body.set(chunk, at);
      at += chunk.byteLength;
    }
    return handler(body, { viewer: viewerOf(c), c });
  };
}
