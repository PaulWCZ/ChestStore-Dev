import { chest } from "@argentic/chest-sdk/chest";
import { createApp, fill, page, publicPage, redirect, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { actions } from "./actions.ts";
import { locales, localeOf, words, type Catalogue, type Locale } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { roleOf } from "./lib/access.ts";
import { db, type Sql } from "./lib/db.ts";
import { chestEvents, chestMail, chestSchedules, chestWebhooks } from "./lib/deliveries.ts";
import { exportDownload, filePolicy, mineFile, originalEmail, publicFile, teamFile } from "./lib/downloads.ts";
import { frameOrigins } from "./lib/frame.ts";
import { folderCounts, myOpenCount } from "./lib/tickets.ts";
import { listViews } from "./lib/views.ts";
import { contactPage } from "./pages/contact.tsx";
import { followUpPage } from "./pages/follow-up.tsx";
import { TeamFrame, type Desk } from "./pages/frame.tsx";
import { inboxPage } from "./pages/inbox.tsx";
import { minePage, myRequestPage } from "./pages/mine.tsx";
import { newTicketPage } from "./pages/new-ticket.tsx";
import { reportsPage } from "./pages/reports.tsx";
import { settingsPage } from "./pages/settings.tsx";
import { ticketPage } from "./pages/ticket.tsx";
import { lookOf, sheetOf } from "./theme.ts";

// Support's routes. createApp() already serves /assets/, the actions
// (src/actions.ts) at /chest/actions/<name> and /actions/<name>, the
// member of every /chest request (401 without), the look (/chest/look.css,
// /look.css: src/theme.ts), /lang/<code>, the error pages, and answers 404
// to anything else.
const routes = createApp({
  actions,
  islands,
  locales,
  words,
  layouts: { members: MembersLayout, public: PublicLayout },
  look: viewer => lookOf(viewer.member !== null ? "team" : "public"),
  // Support's icon; no search engine indexes a request's page.
  head: viewer => <><meta name="robots" content="noindex, nofollow" /><meta name="description" content={viewer.t.meta.tagline} /><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

// ---- The team's part (/chest…). A page of it is drawn in the team's
// frame (src/pages/frame.tsx): the folders and saved views with their
// counts, the sections. A member without a role — a colleague who asked
// something with a team form of Forms — reaches My requests only: any
// other page leads there (a ticket's address to their own view of it,
// where it is theirs). Each rule checks rights again (src/lib/access.ts).
export type TeamContext = PageContext<MemberContext> & { sql: Sql; lang: Locale; desk: Desk | null };
type TeamView = View | Response;

const team = (render: (ctx: TeamContext) => Promise<TeamView> | TeamView, { mine = false }: { mine?: boolean } = {}) => page(async ctx => {
  const role = roleOf(ctx.member);
  if (!role && !mine) {
    const ticket = /^\/chest\/tickets\/([0-9]{1,9})$/u.exec(ctx.url.pathname);
    redirect(ticket ? `/chest/mine/${ticket[1]}` : "/chest/mine");
  }
  const sql = db();
  const desk = role ? await Promise.all([folderCounts(sql, ctx.member), listViews(sql, ctx.member), myOpenCount(sql, ctx.member)]).then(([counts, views, mine]) => ({ counts, views, mine })) : null;
  const view = await render({ ...ctx, sql, lang: localeOf(ctx.locale), desk });
  if (view instanceof Response) return view;
  const sheet = await sheetOf("team");
  return {
    title: view.title,
    body: (
      <TeamFrame member={ctx.member} t={ctx.t} path={ctx.url.pathname} query={ctx.url.searchParams} logo={sheet.look.logo ?? null} notice={noticeOf(ctx.url, ctx.t)} desk={desk}>
        {view.body}
      </TeamFrame>
    ),
  };
});

// A refusal of a form sent without JavaScript, from the address the
// package sends it back to (?error=code&values={"max":…}): numbers only.
export function noticeOf(url: URL, t: Catalogue): string | null {
  const code = url.searchParams.get("error");
  if (!code || !Object.hasOwn(t.errors, code)) return null;
  let values: Record<string, number> = {};
  try {
    const raw = JSON.parse(url.searchParams.get("values") ?? "{}") as unknown;
    if (raw && typeof raw === "object") values = Object.fromEntries(Object.entries(raw).filter((e): e is [string, number] => /^\w{1,32}$/u.test(e[0]) && typeof e[1] === "number" && Number.isFinite(e[1])));
  } catch { /* no values */ }
  const said = fill(t.errors[code as keyof Catalogue["errors"]], values);
  return /\{\w+\}/u.test(said) ? t.errors.invalid : said;
}

// The inbox: a folder, a search, a tag, a saved view.
routes.get("/chest", team(inboxPage));
routes.get("/chest/tickets/:number", team(ctx => ticketPage(ctx, ctx.param("number"))));
routes.get("/chest/new", team(newTicketPage));
routes.get("/chest/settings", team(settingsPage));
routes.get("/chest/reports", team(reportsPage));
routes.get("/chest/mine", team(minePage, { mine: true }));
routes.get("/chest/mine/:number", team(ctx => myRequestPage(ctx, ctx.param("number")), { mine: true }));

// Files: an attachment (a fresh link the Chest signs; ?thumbnail=1 a
// photo's thumbnail), a received email's original, a file of one's own
// request, the export.
routes.get("/chest/files/:id", c => teamFile(c.get("viewer").member, c.req.param("id"), c.req.query("thumbnail") === "1"));
routes.get("/chest/messages/:id/original", c => originalEmail(c.get("viewer").member, c.req.param("id")));
routes.get("/chest/mine/:number/files/:id", c => mineFile(c.get("viewer").member, c.req.param("number"), c.req.param("id")));
routes.get("/chest/export", c => {
  const { member, t, locale } = c.get("viewer");
  return exportDownload(member, t, localeOf(locale), chest.today());
});

// ---- The public part ("public": true): the contact form, a request's
// follow-up page (its address is the secret), the request's files.
routes.get("/", publicPage(contactPage));
routes.get("/t/:secret", publicPage(ctx => followUpPage(ctx, ctx.param("secret"))));
routes.get("/t/:secret/files/:id", c => publicFile(c.req.param("secret"), c.req.param("id")));

// ---- What the Chest sends by itself, signed (src/lib/deliveries.ts).
routes.post("/chest-events", c => chestEvents(c.req.raw));
routes.post("/chest-schedules", c => chestSchedules(c.req.raw));
routes.post("/chest-mail", c => chestMail(c.req.raw));
routes.post("/chest-webhooks", c => chestWebhooks(c.req.raw));

// ---- Two answers keep a policy of their own, set here around the
// package's one policy for every answer:
// - a file is a download in a sandbox (nothing in it ever runs);
// - the public form and its follow-up pages may be shown in a frame by the
//   company's websites an administrator listed (Settings, "On your
//   website"; src/lib/frame.ts): their frame-ancestors names them. Read
//   from the database for each such page, never kept in the process. The
//   team's pages never. Note: the Chest's front adds `frame-ancestors
//   'none'` to every public answer today, and two policies intersect, so
//   the frame works only once the Chest lets an administrator allow it
//   (README, "Needs from the SDK").
async function framed(request: Request, response: Response): Promise<Response> {
  const policy = response.headers.get("content-security-policy");
  if (!policy) return response;
  const path = new URL(request.url).pathname;
  let next: string | null = null;
  if (response.headers.get("content-disposition")?.startsWith("attachment")) next = filePolicy;
  else if ((path === "/" || /^\/t\/[^/]+$/u.test(path)) && response.headers.get("content-type")?.startsWith("text/html")) {
    const origins = await frameOrigins();
    if (origins.length > 0) next = policy.replace(/frame-ancestors [^;]*/u, `frame-ancestors ${origins.join(" ")}`);
  }
  if (next === null || next === policy) return response;
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", next);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const app = {
  fetch: async (request: Request, ...rest: unknown[]): Promise<Response> => framed(request, await (routes.fetch as (r: Request, ...a: unknown[]) => Response | Promise<Response>)(request, ...rest)),
};
