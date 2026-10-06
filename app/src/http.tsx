import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
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
import { setIslands, startRender } from "./island.tsx";
import { log } from "./log.ts";
import type { ErrorCode, Words } from "./register.ts";
import { AppError, HttpStatus, readInput, toolPath, type Action, type Cookies, type MemberContext, type VisitorContext } from "./tool.ts";

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
export type View = { title: string; body: ReactNode };
// What a layout gets: the viewer, the path, a refusal of a form sent
// without JavaScript (notice), the page.
// look: the request's look when createApp has one (its logo, in brand
// mode); status: the page's (an error page's layout may draw more frame).
export type LayoutProps<V extends Viewer> = { viewer: V; path: string; notice: string | null; look: Look | null; status: number; children: ReactNode };
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

type Env = { Variables: { viewer: MemberContext } };
// A file the build names by its content (client-<hash>.js, a chunk).
const hashed = /^\/assets\/[\w.-]+-[\w-]{8}\.js$/u;
const firstSegment = (path: string) => path.split("/")[1]?.toLowerCase() ?? "";
const isMembers = (path: string) => firstSegment(path) === "chest";

let options: AppOptions;

function cookiesOf(c: Context): Cookies {
  return {
    get: name => getCookie(c, name),
    set: (name, value, o) => setCookie(c, name, value, { path: o.path, maxAge: o.maxAge, sameSite: "Lax", secure: true, httpOnly: true }),
  };
}
function visitor(c: Context): VisitorContext {
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
    if (raw && typeof raw === "object") values = Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^\w{1,32}$/u.test(k) && (typeof v === "number" || (typeof v === "string" && v.length < 100))));
  } catch { /* no values */ }
  return fill(t.errors[code as ErrorCode], values);
}

async function html(c: Context, view: View, viewer: Viewer, status: 200 | 401 | 403 | 404 | 500 = 200) {
  const { script, version: v } = browserFiles();
  const look = options.look ? await options.look(viewer) : null;
  const lookTag = look ? createHash("sha256").update(look.css).digest("base64url").slice(0, 16) : "";
  const name = viewer.t.tool.name;
  const notice = noticeOf(c, viewer.t);
  const { members: Members, public: Public } = options.layouts;
  startRender();
  const page = renderToString(
    <html lang={viewer.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{view.title === name ? view.title : `${view.title} · ${name}`}</title>
        {look?.colors?.map(m => <meta key={m.media} name="theme-color" media={m.media} content={m.color} />)}
        {options.head?.(viewer)}
        <link rel="stylesheet" href={`/assets/client.css?v=${v}`} />
        {look && <link rel="stylesheet" href={`${viewer.member !== null ? "/chest" : ""}/look.css?v=${lookTag}`} />}
        <script type="module" src={`/assets/${script}`} />
      </head>
      <body>
        {viewer.member !== null
          ? <Members viewer={viewer} path={c.req.path} notice={notice} look={look} status={status}>{view.body}</Members>
          : <Public viewer={viewer} path={c.req.path} notice={notice} look={look} status={status}>{view.body}</Public>}
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
  return view instanceof Response ? view : html(c, view, viewer);
};

// A mutation is sent by the page itself: the browser says so
// (Sec-Fetch-Site), or, for an older one, its Origin is this host.
function sameOrigin(request: Request): boolean {
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
  const name = c.req.param("name") ?? "";
  const definition = Object.hasOwn(options.actions, name) ? options.actions[name] : undefined;
  const viewer = members ? c.get("viewer") : visitor(c);
  const fetched = c.req.header("x-tool-action") === "1";
  const refuse = (status: 400 | 403 | 404 | 413 | 500, code: ErrorCode, values?: Record<string, string | number>) =>
    fetched ? c.json({ ok: false, error: code, message: fill(viewer.t.errors[code], values) }, status) : c.redirect(back(c, members, code, values), 303);
  if (!sameOrigin(c.req.raw)) return fetched ? refuse(403, "forbidden") : c.text("Cross-site request refused.", 403);
  if (!definition || definition.access !== (members ? "member" : "public")) return refuse(404, "not_found");
  const json = c.req.header("content-type")?.startsWith("application/json") === true;
  if (json && !fetched) return c.text("Cross-site request refused.", 403);
  let answer: Response | undefined;
  const refused = await bodyLimit({ maxSize: definition.maxBody, onError: () => refuse(413, "too_large") })(c, async () => {
    try {
      const raw = json ? await c.req.json<Record<string, unknown>>() : formFields(await c.req.formData());
      const value = await definition.run(readInput(definition.input, raw !== null && typeof raw === "object" ? raw : {}) as never, { ...viewer, cookies: cookiesOf(c), request: c.req.raw } as never);
      answer = fetched ? c.json({ ok: true, value: value ?? null }) : c.redirect(back(c, members), 303);
    } catch (error) {
      if (error instanceof HttpStatus && error.to) answer = fetched ? c.json({ ok: true, value: null, redirect: error.to }) : c.redirect(error.to, 303);
      else if (error instanceof HttpStatus) answer = refuse(error.status === 403 ? 403 : 404, error.status === 403 ? "forbidden" : "not_found");
      else if (error instanceof AppError) answer = refuse(error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : 400, error.code, error.values);
      else if (error instanceof SyntaxError) answer = refuse(400, "invalid");
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
function stylesheet(c: Context, css: string) {
  const hash = createHash("sha256").update(css).digest("base64url");
  const tag = `"${hash.slice(0, 27)}"`;
  c.header("ETag", tag);
  c.header("Cache-Control", c.req.query("v") === hash.slice(0, 16) ? "private, max-age=31536000, immutable" : "private, no-cache");
  if (c.req.header("if-none-match") === tag) return c.body(null, 304);
  c.header("Content-Type", "text/css; charset=utf-8");
  return c.body(css);
}

// publicActionsAt(): the public actions also answered under a path of the
// tool's — app.post("/p/:link/actions/:name", publicActionsAt()) — so a
// cookie kept for that path only (a guest's secret for one poll) reaches
// them. call(name, input, { at: "/p/abc" }) sends there.
export const publicActionsAt = () => (c: Context<Env>) => runAction(c, false);

export function createApp(appOptions: AppOptions) {
  options = appOptions;
  setIslands(appOptions.islands);
  const app = new Hono<Env>();

  // Every answer: the policy, the headers that go with it, a log line.
  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    c.header("Content-Security-Policy", policy);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "same-origin");
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

  // The browser's files (dist/client/assets, from src/ and public/assets/):
  // linked with ?v=…, or named by their hash (the script, its chunks),
  // they never change; any other, an hour.
  // (Set once the file is served: a header set in serveStatic's onFound
  // never reached the browser — the files went out "no-store".)
  app.use("/assets/*", async (c, next) => {
    await next();
    if (c.res.ok) c.res.headers.set("Cache-Control", c.req.query("v") || hashed.test(c.req.path) ? "public, max-age=31536000, immutable" : "public, max-age=3600");
  }, serveStatic({ root: "./dist/client" }));

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
    if (chestDown(error)) log.warn("the Chest did not answer", { route: routePath(c, -1), error: error.name });
    else log.error("page failed", error, { route: routePath(c, -1) });
    return html(c, errorView(viewerOf(c), 500), viewerOf(c), 500);
  });
  return app;
}
