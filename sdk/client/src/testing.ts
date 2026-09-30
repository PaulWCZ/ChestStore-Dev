import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Alias, Provider } from "./ai.js";
import type { AiUnavailableReason } from "./errors.js";
import { occurredAtOf, type ChestEvent } from "./events.js";
import { groupIdPattern, member as memberOf, memberIdPattern, type Member } from "./member.js";
import { check as checkCalendarEvent, feed as calendarFeed, keyPattern as calendarKeyPattern, limits as calendarLimits, type CalendarEvent, type KeptEvent } from "./calendar.js";
import { forgetTheme, toolNamePattern } from "./chest.js";
import { threadTag } from "./mail.js";
import { isIP } from "node:net";
import { forget } from "./members.js";
import { checkInput as checkWebhookInput, checkMessage as checkWebhookMessage, deliveryIdPattern as webhookDeliveryPattern, format as formatWebhook, isPublicAddress, keyPattern as wireKeyPattern, limits as webhookLimits, shownUrl, sign as signWebhook, targetIdPattern as webhookTargetPattern, type WebhookDelivery, type WebhookKind, type WebhookTarget } from "./webhooks.js";

// For a tool's own tests, never imported by its production code: a member's
// assertion signed as the Chest signs it, and a Chest's API in the test's
// process that answers members, groups, files (stat, move, links; an upload
// it authorises but does not receive), badges, notifications, AI (chat,
// streamed or not, embeddings, models, usage: deterministic answers, no
// provider) and the acknowledgment of an erasure with the Chest's bounds,
// quotas and errors; and that delivers an event to the tool, signed as the
// Chest signs it.
//
// 0.3.1-studio: the official fakeChest of 0.3.0, and the fakes of the
// studio's proposals (Proposal (studio)): its front (uploads, links,
// photos, public files, the look's files, calendar feeds), schedules, mail,
// the calendar, webhooks, visitors, checks, events between tools, the
// declared network, the tools installed beside this one, the look.
//
//   import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
//   const chest = await fakeChest({ members: [camille], capabilities: ["members", "files", "notifications"] });
//   const response = await app(withMember(new Request("http://tool/chest"), camille));
//   assert.equal(chest.notifications[0]?.member, camille.id);
//   assert.equal(await chest.emit({ type: "access.revoked", data: { id: camille.id } }, request => app(request)), 204);
//   await chest.close();

// A member as a test names them (Proposal (studio)): a Member whose
// language and time zone may be left out — the fake Chest then gives the
// Chest's own (options.chest: "en" and "UTC" unless said), as a real Chest
// gives its default to a member who chose none. A value given is signed as
// given: one the Chest never sends makes member() refuse it.
export type FakeMember = Omit<Member, "language" | "timeZone"> & { language?: string; timeZone?: string };

// A group as a fake Chest keeps it: its identifier, its name, and the
// identifiers of its members. grants (true by default) says it gives the
// tool: groups.list() and a member's groups show only those, unless the
// tool holds "groups" (Proposal (studio)), which sees them all.
export type FakeGroup = { id: string; name: string; members: string[]; grants?: boolean };
// Proposal (studio): an event of the calendar as the fake Chest keeps it.
export type FakeCalendarEvent = KeptEvent;
// A file as a fake Chest keeps it.
export type FakeFile = { data: Uint8Array; type: string; updated: string };
// A notification as a fake Chest keeps it: the member it went to, its text
// cleaned as the Chest cleans it, its path (/chest when not said) and its
// key.
export type FakeNotification = { member: string; title: string; body?: string; path: string; key?: string };

// An alias a fake Chest maps: the model behind it, its provider (openrouter
// by default) and its prices in US dollars per million tokens (1 and 2 by
// default).
export type FakeAiModel = { alias: Alias; model: string; provider?: Provider; input?: number; output?: number };
// What a fake model answers: text, or text and tool calls (an id of call_…
// by default; arguments are JSON text).
export type FakeAiReply = string | { text?: string; toolCalls?: { name: string; arguments: string; id?: string }[] };
// The AI of a fake Chest: the aliases the tool declared, each mapped (all
// four by default: fake-default, fake-fast, fake-smart, fake-embedding); what
// its models answer to a chat, given the request as the tool sent it (the
// last user message's text, echoed, by default); the tool's monthly cap in
// euros (5 by default; a call is refused cap_reached once the spending
// reaches it, 0 refuses at once); and a reason that makes chat and
// embeddings unavailable.
export type FakeAi = { models?: FakeAiModel[]; reply?: (request: Record<string, unknown>) => FakeAiReply; cap?: number; unavailable?: AiUnavailableReason };
// A call of the tool to the AI of a fake Chest: its path and its body as
// sent (null for a GET).
export type FakeAiCall = { path: string; body: unknown };

// What a fake Chest is given: the members who have the tool, those who left
// it (erased: their data was erased, the name gone), its groups, the
// capabilities its version holds (a capability left out answers 403;
// members, files, notifications and ai by default, members.email to read the
// addresses), the events it receives (["member.*"] by default, [] to answer
// an acknowledgment 403), the files it keeps, its AI, and what the Chest is
// (the chest module: "Test organization", UTC and English by default).
// Proposal (studio): the origin of the team host its links and uploads point
// to (https://<tool>-chest.chest.test by default; a harness gives its own,
// http://localhost:<port>, and relays /_chest/ to the fake Chest's address),
// and the options of the studio's proposals below.
export type FakeChestOptions = {
  // studio.15: the tool's name (chest.json "name"), set as CHEST_TOOL while
  // the fake runs — what events.publish, member() and the signatures read.
  // The environment's CHEST_TOOL, or "tool", when left out.
  tool?: string;
  members?: FakeMember[];
  // leftAt (Proposal (studio.15)): when they left, as lookup says it.
  former?: FakeFormer[];
  groups?: FakeGroup[];
  capabilities?: string[];
  receives?: string[];
  files?: Record<string, { data: Uint8Array | string; type?: string }>;
  ai?: FakeAi;
  // What the Chest is (CHEST_ORGANIZATION, CHEST_TIME_ZONE, CHEST_LANGUAGE).
  // Proposal (studio): its currency (CHEST_CURRENCY, unset unless named:
  // chest.currency then reads EUR) and this tool's public host
  // (CHEST_PUBLIC_URL, set only when named: a tool with a public part); the
  // team host (CHEST_TEAM_URL) is the fake's origin.
  chest?: { organization?: string; timeZone?: string; language?: string; currency?: string; publicUrl?: string };
  // ---- Proposal (studio) ----
  origin?: string;
  schedules?: { name: string; cron: string }[];
  // Proposal (studio): the other tools installed on this Chest, by name,
  // and their addresses (chest.toolUrl, CHEST_TOOL_URLS): true for a tool
  // with its team host only, at https://<name>-chest.chest.test; or its
  // team and public origins as a test names them (public: an open public
  // part). This tool is always there, at the fake's origin (and its
  // chest.publicUrl).
  tools?: Record<string, FakeToolAddresses | true>;
  // Proposal (studio): the Chest's ceiling per visitor's address across
  // the tools, an hour (visitors.count).
  visitors?: { perAddressHour?: number };
  // false: a Chest without notifications.broadcast (404), to test a tool's
  // fallback.
  broadcast?: boolean;
  // Proposal (studio): checks run by the Chest (chest.json "checks": {max});
  // configured holds what the tool configured.
  checks?: { max: number };
  // Proposal (studio): the events this tool publishes (chest.json "emits"),
  // and how many tools receive them.
  emits?: string[];
  receivers?: number;
  // Proposal (studio.16): the tools an admin linked to receive each type
  // this tool emits ({"forms.contact": ["crm"]}), which events.receivers
  // answers and publish counts (instead of receivers) — also chest.linked.
  linked?: Record<string, string[]>;
  // Proposal (studio.16): whether the Chest delivers mail and webhooks
  // (mail.available, webhooks.available): "ready" by default; also
  // chest.delivery, which a test changes at any time.
  delivery?: Partial<FakeDelivery>;
  // Proposal (studio): the storage spec's public uploads and public files.
  storage?: { publicUploads?: boolean; publicFiles?: boolean; publicOrigin?: string };
  // Proposal (studio): mail (with "mail" in capabilities).
  mail?: { domain?: string; mailboxes?: string[]; perDay?: number; suppressed?: string[] };
  // Proposal (studio): the calendar bridge (with "calendar" in
  // capabilities): the Chest's domain in UIDs, the tool's title in each
  // event's category, the name of the feed ("Atelier Martin" gives "Chest
  // — Atelier Martin"; the Chest's organization when left out), and a Chest
  // without it (false: 404).
  calendar?: { domain?: string; toolTitle?: string; company?: string } | false;
  // Proposal (studio): the look the company chose (chest.theme()): for all
  // its tools, and per tool (by name) — the tool receives its own override,
  // or the choice for all, or its own identity. Held in chest.theme, which a
  // test or a harness changes at any time.
  theme?: FakeTheme;
  // Proposal (studio): the files the Chest's front serves under
  // /_chest/theme/ (the catalogue's fonts, a brand's fonts and logo), by
  // path below it ("fonts/inter-latin-wght-normal.woff2", "brand/logo.svg").
  themeFiles?: Record<string, { data: Uint8Array | string; type?: string }>;
  // Proposal (studio): webhooks (chest.json "webhooks": {max}) — the Chest
  // delivers to the addresses the tool adds. resolve plays DNS: a host name
  // → the address it resolves to ("nxdomain": none); a name left out
  // resolves to a public address. deliver, when given, receives each POST
  // the Chest would make (a test's own receiver); otherwise every target
  // answers 200 until chest.webhooks.respond() says otherwise. to is where
  // webhook.disabled is posted (the tool's address, or a handler), also
  // settable as chest.webhooks.to.
  webhooks?: { max: number; resolve?: Record<string, string>; deliver?: (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<Response | number>; to?: string | ((request: Request) => Response | Promise<Response>) };
  // studio.15: the hosts the tool declares (chest.json "network") and who
  // answers for each — "graph.microsoft.com", or "*.icloud.com" for every
  // name below it. While the fake runs, the tool's plain fetch() goes as
  // through the Chest's egress proxy: a declared host to its handler, a
  // name not declared, an IP literal or a port other than 80 and 443
  // refused as the proxy refuses it; localhost, 127.0.0.1 and ::1 (the
  // Chest's NO_PROXY: CHEST_API, the tool's own test server) straight
  // through. Without this option, fetch() is left alone.
  network?: Record<string, FakeNetworkHandler>;
};

// Proposal (studio.16): whether the fake Chest delivers mail (the owner
// connected a provider; the Chest has not paused it) and webhooks (not
// paused by the owner).
export type FakeDelivery = { mail: "ready" | "not_connected" | "suspended"; webhooks: "ready" | "suspended" };
// A former member as a test names them (Proposal (studio.15): leftAt).
export type FakeFormer = { id: string; name?: string; erased?: boolean; leftAt?: string };
// studio.15: what answers a declared host in a test, for the request the
// tool's fetch() made (its whole URL, method, headers and body).
export type FakeNetworkHandler = (request: Request) => Response | Promise<Response>;
// A request the tool's fetch() made to the outside while the fake ran:
// answered by a handler (status), or refused as the Chest's proxy refuses
// (reason: undeclared, ip-literal, port).
export type FakeEgress = { method: string; url: string; status: number | null; refused?: "undeclared" | "ip-literal" | "port" };
// A message held back by a member's email preference (Proposal
// (studio.15)): "none" (not sent), "digest" (in their daily digest).
export type FakeHeldMail = { id: string; member: string; reason: "none" | "digest"; subject: string; text: string };

// Proposal (studio): a tool installed beside this one, as a test names it:
// its team origin (https://<name>-chest.chest.test when left out; null for
// none) and its public origin while its public part is open.
export type FakeToolAddresses = { team?: string | null; public?: string | null };

// Proposal (studio): how a webhook target answers the fake Chest: an HTTP
// status, or a network failure.
export type FakeWebhookAnswer = number | "timeout" | "dns" | "tls" | "refused";
// A target as the fake Chest keeps it: what list() shows, and the whole
// address and the secrets that sign (the newest first).
export type FakeWebhookTarget = WebhookTarget & { fullUrl: string; secrets: string[] };
// A delivery as the fake keeps it: what journal() shows, the message, and
// the last request made (url, headers — the signature — and body).
export type FakeWebhookDelivery = WebhookDelivery & { text: string; data?: Record<string, unknown>; request: { url: string; headers: Record<string, string>; body: string } | null };
export type FakeWebhooks = {
  targets: FakeWebhookTarget[];
  deliveries: FakeWebhookDelivery[];
  // The webhook.disabled events the Chest posted to the tool, and the status
  // it answered (null: no `to` to post to).
  events: { id: string; type: "webhook.disabled"; target: string; reason: "failures" | "gone"; lastError: string | null; status: number | null }[];
  to: string | ((request: Request) => Response | Promise<Response>) | null;
  // How a target (by id, or by its whole address before it is added)
  // answers from now on; 200 by default.
  respond(target: string, answer: FakeWebhookAnswer): void;
  // The time of every pending retry comes: each delivery "retrying" is
  // attempted once more. Says how many were attempted.
  retry(): Promise<number>;
};

// A choice as a test names it: what theme() answers, without its scope
// (the fake Chest says which level it came from).
export type FakeThemeChoice = { mode: "own" } | { mode: "catalogue"; theme: string; fonts?: string; faces?: unknown[] } | { mode: "brand"; brand: Record<string, unknown>; fonts?: string } | Record<string, unknown>;
// The company's two levels: its choice for all tools, and its overrides.
export type FakeTheme = { all?: FakeThemeChoice | null; tools?: Record<string, FakeThemeChoice | null> };

// A message the tool sent, as the fake Chest's outbox keeps it (addresses
// resolved, members' included).
export type FakeMail = { id: string; messageId: string; from: string; fromName: string | null; to: string[]; cc: string[]; subject: string; text: string; html?: string; replyTo?: string; inReplyTo?: string; references?: string[]; attachments: { name: string; type: string; size: number }[]; key?: string; status: "sent" | "bounced" };
// A message to deliver to the tool, as someone outside would write it.
// Proposal (studio): thread delivers it to that thread's address (as a
// reply to a message sent with {mailbox, thread}); deliveredTo names the
// address outright; html is cleaned as the Chest cleans it; authenticated
// (true by default) and auto say what the Chest found.
export type FakeIncoming = { mailbox: string; from: string; fromName?: string; subject: string; text: string; html?: string; to?: string[]; cc?: string[]; inReplyTo?: string; references?: string[]; attachments?: { name: string; type: string; content: string | Uint8Array }[]; spam?: number; thread?: string; deliveredTo?: string; authenticated?: boolean; auto?: boolean; id?: string };

// An event for emit: its type and data; its id (a new evt_… by default) and
// when it happened (now by default) may be named, to deliver the same event
// twice.
export type FakeEvent = { [K in ChestEvent["type"]]: { type: K; data: Extract<ChestEvent, { type: K }>["data"]; id?: string; occurredAt?: string } }[ChestEvent["type"]];

// A fake Chest in the test's process: its address, the token and the tool it
// set in the environment, what it keeps (members, groups and files a test
// changes or reads; the notifications the tool sent, in the order sent, a
// replaced one last; each member's badge; the erasures the tool
// acknowledged), upload, which sends a file to an uploadUrl as a member's
// browser would, emit, which delivers an event to the tool — POST
// /chest-events of its address, or a handler of Web Requests — and says the
// status it answered, and close, which stops it and restores the
// environment. Its members are those who have the tool: the others are
// skipped.
export type FakeChest = {
  api: string;
  token: string;
  tool: string;
  members: Member[];
  // Those who left (or were erased): what members.lookup answers "former"
  // for. A test or a harness that removes a member moves them here (and
  // calls clearCaches()).
  former: FakeFormer[];
  groups: FakeGroup[];
  files: Map<string, FakeFile>;
  notifications: FakeNotification[];
  badges: Map<string, number>;
  acknowledged: string[];
  ai: FakeAiCall[];
  emit(event: FakeEvent, to: string | ((request: Request) => Response | Promise<Response>)): Promise<number>;
  upload(url: string, data: Uint8Array | string, type: string): Promise<Response>;
  // Proposal (studio): the tool's schedules, the runs delivered, and run(),
  // which delivers a run of a schedule as the Chest would at its time.
  // Proposal (studio): the events the tool published, and deliver(), which
  // hands the tool an event of another tool as the Chest would.
  // occurredAt (studio.16): the one the tool gave, or the time of the publish.
  published: { id: string; type: string; data: Record<string, unknown>; key?: string; occurredAt: string }[];
  // Proposal (studio.16): the tools linked to receive each type this tool
  // emits (events.receivers), and whether mail and webhooks deliver
  // (available()).
  linked: Record<string, string[]>;
  delivery: FakeDelivery;
  deliver(event: { type: string; source?: string; data: Record<string, unknown>; id?: string; occurredAt?: string }, to: string | ((request: Request) => Response | Promise<Response>)): Promise<number>;
  // Proposal (studio): check() delivers a result of a declared check to POST
  // <to>/chest-checks, signed as the Chest would (Chest-Check); ok by default.
  // Proposal (studio): the checks the tool configured (checks.configure).
  checks: { name: string; url: string; every: number; expect?: { status?: number; maxMs?: number } }[];
  check(name: string, to: string | ((request: Request) => Response | Promise<Response>), result?: { ok?: boolean; status?: number | null; ms?: number; error?: string | null; at?: string; id?: string }): Promise<number>;
  // Proposal (studio): the mail the tool sent, and receive(), which delivers
  // a message to its POST /chest-mail as the Chest would.
  outbox: FakeMail[];
  // Proposal (studio.15): what members' email preferences held back.
  held: FakeHeldMail[];
  // studio.15: the requests the tool's fetch() made outside (network).
  egress: FakeEgress[];
  // studio.15: forgets what this process keeps of the Chest's answers —
  // members.lookup's minute and the theme — after a test changed
  // chest.members, chest.former or chest.theme by hand (an event delivered
  // with emit() already does it).
  clearCaches(): void;
  receive(message: FakeIncoming, to: string | ((request: Request) => Response | Promise<Response>)): Promise<number>;
  // Proposal (studio): bounce() plays a sent message's bounce: its status
  // becomes "bounced", a permanent one suppresses the address, and the
  // bounce is posted to POST <to>/chest-mail.
  bounce(message: string, to: string | ((request: Request) => Response | Promise<Response>), options?: { recipient?: string; permanent?: boolean; reason?: string; id?: string }): Promise<number>;
  // Proposal (studio): the calendar bridge — the events the tool put, by
  // key; feed() is one member's feed as the Chest writes it (their events
  // of this tool, in their language); feedUrl() its secret address on the
  // fake's front (/_chest/calendar/<secret>.ics), which newFeedUrl()
  // replaces (the old one answers 404).
  calendar: Map<string, FakeCalendarEvent>;
  feed(member: string, options?: { locale?: string; now?: Date }): string;
  feedUrl(member: string): string;
  newFeedUrl(member: string): string;
  schedules: { name: string; cron: string }[];
  // Proposal (studio): the company's look (theme()), both levels, and the
  // files its front serves under /_chest/theme/.
  theme: { all: FakeThemeChoice | null; tools: Record<string, FakeThemeChoice | null> };
  themeFiles: Map<string, { data: Uint8Array; type: string }>;
  runs: { id: string; name: string; scheduledAt: string; attempt: number; status: number }[];
  // Proposal (studio): the webhook targets, deliveries and events, and the
  // controls that play the receivers.
  webhooks: FakeWebhooks;
  // Proposal (studio): the tools installed on this Chest, as
  // CHEST_TOOL_URLS gives them (this tool included); installTool() and
  // removeTool() play the owner installing (or opening a public part) and
  // removing one — the environment is rewritten, as the Chest does before
  // the tool's next start.
  tools: Record<string, { team: string | null; public: string | null }>;
  installTool(name: string, addresses?: FakeToolAddresses | true): void;
  removeTool(name: string): void;
  run(name: string, to: string | ((request: Request) => Response | Promise<Response>), options?: { id?: string; scheduledAt?: string; attempt?: number }): Promise<number>;
  close(): Promise<void>;
};

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");

// What an assertion is signed with and says besides the member: the token
// (CHEST_TOKEN by default) and the tool (CHEST_TOOL by default) it is for,
// and when it is issued (now by default). The member is signed as given: a
// language or a zone the Chest would never send makes member() refuse the
// assertion, as it refuses the Chest's. Proposal (studio): a language or a
// zone left out is the Chest's (CHEST_LANGUAGE, CHEST_TIME_ZONE; "en" and
// "UTC" outside a fake Chest).
export type AssertionOptions = { token?: string; tool?: string; now?: Date };

// completed is a test's member as the Chest would send them: the Chest's
// language and zone for those left out (Proposal (studio)).
function completed(member: FakeMember): Member {
  return { ...member, language: member.language ?? process.env["CHEST_LANGUAGE"] ?? "en", timeZone: member.timeZone ?? process.env["CHEST_TIME_ZONE"] ?? "UTC" } as Member;
}

// signAssertion is the Chest-Member value the Chest's front would send for
// that member: HS256 under the key of the token, for the tool, valid 60
// seconds from when it is issued.
export function signAssertion(given: FakeMember, options: AssertionOptions = {}): string {
  const member = completed(given);
  const token = options.token ?? process.env["CHEST_TOKEN"];
  const tool = options.tool ?? process.env["CHEST_TOOL"];
  if (!token || !tool) throw new Error("signAssertion needs a token and a tool: start a fakeChest, or name them");
  if (!memberIdPattern.test(member.id) || !member.groups.every(g => groupIdPattern.test(g))) throw new Error("signAssertion needs identifiers of the Chest's shape (mbr_…, grp_…)");
  const iat = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const body = encode({ alg: "HS256", typ: "JWT" }) + "." + encode({
    iss: `https://${tool}-chest.chest.test`, aud: tool, iat, exp: iat + 60, sub: member.id,
    given_name: member.firstName, family_name: member.lastName, name: member.name, picture: member.photo ?? "", role: member.role ?? "",
    admin: member.isAdmin, builder: member.isBuilder, groups: member.groups, time_zone: member.timeZone, ...(member.email === undefined ? {} : { email: member.email }),
    language: member.language,
  });
  // The key as the Chest derives it, and member() reads it: HMAC-SHA256 of
  // the label of the assertion's shape under the text of the token.
  const key = createHmac("sha256", Buffer.from(token, "utf8")).update("Chest-Member v2").digest();
  return body + "." + createHmac("sha256", key).update(body).digest("base64url");
}

// signEvent is the Chest-Event value the Chest would send with that body:
// HS256 under the key the token derives for events, for the tool, naming the
// event and the digest of the body, valid 60 seconds.
function signEvent(id: string, body: string, options: { token: string; tool: string; label?: string }): string {
  const iat = Math.floor(Date.now() / 1000);
  const signed = encode({ alg: "HS256", typ: "JWT" }) + "." + encode({ aud: options.tool, iat, exp: iat + 60, jti: id, digest: createHash("sha256").update(body).digest("base64url") });
  const key = createHmac("sha256", Buffer.from(options.token, "utf8")).update(options.label ?? "Chest-Event v1").digest();
  return signed + "." + createHmac("sha256", key).update(signed).digest("base64url");
}

// withMember is the request carrying that member's assertion, signed with
// the options of signAssertion: a new Web Request, or the same Node request
// with its header set.
export function withMember<R extends Request | IncomingMessage>(request: R, member: FakeMember, options: AssertionOptions = {}): R {
  const assertion = signAssertion(member, options);
  if (request instanceof Request) {
    const headers = new Headers(request.headers);
    headers.set("Chest-Member", assertion);
    return new Request(request, { headers }) as R;
  }
  (request as IncomingMessage).headers["chest-member"] = assertion;
  return request;
}

// The bounds of a Chest (chest/toolmembers, chest/toolfiles).
const maxLimit = 500, defaultLimit = 100, maxLookup = 200, callsPerMinute = 600, matchPerCall = 200, matchPerDay = 5000;
const maxObject = 32 << 20, maxObjects = 10000, maxTotal = 1 << 30;
const namePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}(\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}){0,7}$/u;
// Its notifications: recipients and badges a call, text, quotas.
const maxRecipients = 500, maxTitle = 80, maxText = 280, maxPath = 512, maxCount = 9999;
const recipientsPerHour = 1000, itemsPerDay = 100, badgesPerMinute = 600;
const keyPattern = /^[a-z0-9._:-]{1,64}$/u;
const reordering = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;
const cleanTitle = (s: string): string => s.replace(/[\t\r\n]/gu, " ").replace(/\p{Cc}/gu, "").replace(reordering, "").trim();
const cleanText = (s: string): string => s.replace(/\r\n?/gu, "\n").replace(/\t/gu, " ").replace(/[^\P{Cc}\n]/gu, "").replace(reordering, "").trim();
const isPath = (p: unknown): boolean => typeof p === "string" && p.length <= maxPath && /^\/chest([/?#][\x21-\x5b\x5d-\x7e]*)?$/u.test(p) && !p.includes("//") && !p.split(/[?#]/u)[0]!.split("/").some(x => /^(\.|%2e){1,2}$/iu.test(x));

// Its AI: aliases in order, bounds of a request, requests a minute.
const aliasOrder: readonly Alias[] = ["default", "fast", "smart", "embedding"];
const chatKeys = ["model", "messages", "max_tokens", "stream", "temperature", "top_p", "stop", "tools", "tool_choice", "response_format", "parallel_tool_calls", "seed", "reasoning_effort", "member"];
const maxAiBody = 10 << 20, maxAiOutput = 128000, maxInputs = 256, aiPerMinute = 60, fakeDimensions = 8;
// A fake count of tokens: one per 4 characters.
const tokensOf = (text: string): number => Math.ceil(text.length / 4);
// A vector of a text, the same for the same text: unit length.
function vectorOf(text: string, dimensions: number): number[] {
  const values: number[] = [];
  for (let block = 0; values.length < dimensions; block++) {
    for (const b of createHash("sha256").update(block + ":" + text).digest()) values.push(b / 127.5 - 1);
  }
  const kept = values.slice(0, dimensions), norm = Math.hypot(...kept) || 1;
  return kept.map(x => x / norm);
}

const fold = (s: string): string => s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();

// cleanHtml is the fake's stand-in for the Chest's HTML cleaner of received
// mail (Proposal (studio)): an allow-list of tags, no attribute but a
// link's href (http, https, mailto), nothing of script, style, head,
// template, svg, math or frames, no image, no comment. The Chest uses a
// maintained sanitiser; this one is strict enough for tests to meet what
// the Chest hands a tool, not a library to reuse.
const allowedTags = new Set(["p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "blockquote", "pre", "code", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "td", "th", "a", "hr"]);
const droppedWhole = new Set(["script", "style", "head", "title", "template", "svg", "math", "iframe", "object", "embed", "noscript", "textarea", "select"]);
const voidTags = new Set(["br", "hr"]);
function decodeEntities(v: string): string {
  return v.replace(/&#x([0-9a-f]+);?/giu, (_, h: string) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff))).replace(/&#([0-9]+);?/gu, (_, d: string) => String.fromCodePoint(Math.min(Number(d), 0x10ffff))).replace(/&colon;/giu, ":").replace(/&tab;/giu, "\t").replace(/&newline;/giu, "\n").replace(/&amp;/giu, "&");
}
function cleanHtml(html: string): string {
  const out: string[] = [];
  const open: string[] = [];
  let skipping: string | null = null;
  const text = (t: string) => t.replace(/&(?!(#[0-9]{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/giu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
  const tokens = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|(<)/gu;
  for (const m of html.matchAll(tokens)) {
    const [, closing, rawName, attributes, plain, stray] = m;
    if (plain !== undefined || stray !== undefined) {
      if (!skipping) out.push(text(plain ?? stray!));
      continue;
    }
    if (rawName === undefined) continue; // a comment, a declaration
    const name = rawName.toLowerCase();
    if (skipping) {
      if (closing && name === skipping) skipping = null;
      continue;
    }
    if (droppedWhole.has(name)) {
      if (!closing && !/\/\s*$/u.test(attributes ?? "")) skipping = name;
      continue;
    }
    if (!allowedTags.has(name)) continue;
    if (closing) {
      const at = open.lastIndexOf(name);
      if (at < 0) continue;
      while (open.length > at) out.push(`</${open.pop()}>`);
      continue;
    }
    if (voidTags.has(name)) { out.push(`<${name}>`); continue; }
    let attrs = "";
    if (name === "a") {
      const href = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/iu.exec(attributes ?? "");
      const value = href ? (href[1] ?? href[2] ?? href[3] ?? "") : "";
      const decoded = decodeEntities(value).replace(/[\u0000-\u0020\u007f-\u009f]/gu, "");
      if (/^(https?:\/\/|mailto:)/iu.test(decoded)) attrs = ` href="${decoded.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;")}" rel="noopener noreferrer nofollow"`;
    }
    out.push(`<${name}${attrs}>`);
    open.push(name);
  }
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join("");
}

function send(response: ServerResponse, status: number, value?: unknown, headers: Record<string, string> = {}): void {
  if (value === undefined) return void response.writeHead(status, headers).end();
  const raw = JSON.stringify(value);
  response.writeHead(status, { ...headers, "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(raw)) }).end(raw);
}
async function body(request: IncomingMessage, limit: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > limit) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

// ---- The declared network (studio.15) ----------------------------------------
//
// A tool that declares hosts (chest.json "network") reaches them with plain
// fetch(): in a Chest, the launcher gives it HTTP_PROXY, HTTPS_PROXY (and
// their lowercase forms) = the Chest's egress proxy on 127.0.0.1,
// NO_PROXY=localhost,127.0.0.1,::1 and NODE_USE_ENV_PROXY=1, so Node's fetch
// (Node 24.5 or later) tunnels every other request through the proxy,
// which lets through the declared hosts only. In a test there is no proxy,
// and NODE_USE_ENV_PROXY is read once, when Node starts: so the fake
// replaces globalThis.fetch while it runs instead, with the same outcome
// for the tool's code, unchanged — a declared host is answered by the
// test's handler; anything else outside is refused as the proxy refuses
// (https: fetch() rejects with a TypeError, as when a proxy refuses the
// tunnel; http: the proxy's 403 with Chest-Egress: refused; reason=…);
// localhost and 127.0.0.1 go straight through (the fake's own API, the
// tool's test server). node:http(s).request is not routed: a tool that
// uses it directly is not reached by the handlers.

const hostPattern = /^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/u;
const direct = new Set(["localhost", "127.0.0.1", "::1"]);

function checkNetwork(network: Record<string, FakeNetworkHandler>): void {
  for (const [host, handler] of Object.entries(network)) {
    if (!hostPattern.test(host)) throw new Error(`fakeChest: network ${JSON.stringify(host)} is not a host name as chest.json "network" declares one (lower case, "*." for every name below)`);
    if (typeof handler !== "function") throw new Error(`fakeChest: network ${JSON.stringify(host)} needs a handler (request => Response)`);
  }
}

function routeNetwork(network: Record<string, FakeNetworkHandler>, log: FakeEgress[]): () => void {
  const handlerOf = (host: string): FakeNetworkHandler | undefined => {
    const exact = network[host];
    if (exact && Object.hasOwn(network, host)) return exact;
    const wildcard = Object.keys(network).find(h => h.startsWith("*.") && host.endsWith(h.slice(1)) && host.length > h.length - 1);
    return wildcard ? network[wildcard] : undefined;
  };
  const original = globalThis.fetch;
  const refuse = (request: Request, reason: NonNullable<FakeEgress["refused"]>): Response => {
    log.push({ method: request.method, url: request.url, status: null, refused: reason });
    if (new URL(request.url).protocol === "https:") throw new TypeError("fetch failed", { cause: new Error(`the Chest's egress proxy refused the tunnel: ${reason}`) });
    return new Response(`refused: ${reason}\n`, { status: 403, headers: { "Chest-Egress": `refused; reason=${reason}`, "Content-Type": "text/plain" } });
  };
  const routed = async (input: string | URL | Request, init?: RequestInit, hops = 0): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
    if ((url.protocol !== "http:" && url.protocol !== "https:") || direct.has(host)) return original(input, init);
    if (isIP(host)) return refuse(request, "ip-literal");
    if (url.port !== "" && url.port !== "443" && url.port !== "80") return refuse(request, "port");
    const handler = handlerOf(host);
    if (!handler) return refuse(request, "undeclared");
    const signal = request.signal;
    if (signal.aborted) throw signal.reason;
    const answer = await new Promise<Response>((resolve, reject) => {
      const stop = () => reject(signal.reason);
      signal.addEventListener("abort", stop, { once: true });
      Promise.resolve().then(() => handler(request.clone())).then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
    });
    log.push({ method: request.method, url: request.url, status: answer.status });
    const location = answer.headers.get("location");
    if (answer.status >= 300 && answer.status < 400 && location && request.redirect !== "manual") {
      if (request.redirect === "error" || hops >= 20) throw new TypeError("fetch failed", { cause: new Error("redirect") });
      await answer.body?.cancel();
      const next = new URL(location, request.url).toString();
      const keep = answer.status === 307 || answer.status === 308;
      return routed(next, { method: keep ? request.method : "GET", headers: request.headers, ...(keep && request.body ? { body: await request.arrayBuffer() } : {}), redirect: request.redirect, signal }, hops + 1);
    }
    return answer;
  };
  const patched = ((input: string | URL | Request, init?: RequestInit) => routed(input, init)) as typeof fetch;
  globalThis.fetch = patched;
  return () => {
    if (globalThis.fetch === patched) globalThis.fetch = original;
  };
}

// fakeChest starts a Chest's API on 127.0.0.1 and points the environment at
// it: CHEST_API, CHEST_TOKEN (a new one) and CHEST_TOOL ("tool" unless the
// environment names one). What member() and the modules of the SDK read is
// then this Chest's.
export async function fakeChest(options: FakeChestOptions = {}): Promise<FakeChest> {
  const capabilities = new Set(options.capabilities ?? ["members", "files", "notifications", "ai"]);
  const email = capabilities.has("members.email");
  if (options.tool !== undefined && (!toolNamePattern.test(options.tool) || options.tool.length > 63)) throw new Error(`fakeChest: ${JSON.stringify(options.tool)} is not a tool's name (chest.json "name")`);
  const tool = options.tool ?? (process.env["CHEST_TOOL"] || "tool");
  // Checked before anything starts: a wrong option leaves nothing running.
  if (options.network) checkNetwork(options.network);
  const token = randomBytes(32).toString("base64url");
  const files = new Map<string, FakeFile>();
  for (const [name, file] of Object.entries(options.files ?? {})) {
    files.set(name, { data: typeof file.data === "string" ? new TextEncoder().encode(file.data) : file.data, type: file.type ?? "application/octet-stream", updated: new Date().toISOString() });
  }
  const receives = options.receives ?? ["member.*"];
  // Where the team host's links point: the harness that relays /_chest/
  // here, or a host of no one in a test.
  const origin = (options.origin ?? `https://${tool}-chest.chest.test`).replace(/\/$/u, "");
  const uploads = new Map<string, { name: string; types: string[]; maxSize: number; expires: number; public: boolean; unclaimed?: number }>();
  // Public uploads a visitor sent, waiting for the tool to claim them: the
  // claim token → the object, and when the Chest deletes it unclaimed.
  const claims = new Map<string, { name: string; deleteAt: number | null }>();
  const sweep = () => {
    const now = Date.now();
    for (const [token, c] of claims) if (c.deleteAt !== null && c.deleteAt <= now) { claims.delete(token); files.delete(c.name); }
  };
  const storage = options.storage ?? {};
  // The public host's origin: the harness serves both hosts on one.
  const publicOrigin = (storage.publicOrigin ?? options.origin ?? `https://${tool}.chest.test`).replace(/\/$/u, "");
  const publicMaxObject = 10 << 20;
  // The erasures the tool was told of, by emit: those it may acknowledge.
  const erasures = new Set<string>();
  // What the Chest is, and a member as it gives them (their language and
  // zone, else the Chest's).
  const chestLanguage = options.chest?.language ?? "en", chestZone = options.chest?.timeZone ?? "UTC";
  const full = (m: FakeMember): Member => ({ ...m, language: m.language ?? chestLanguage, timeZone: m.timeZone ?? chestZone } as Member);
  const chest: FakeChest = { api: "", token, tool, members: (options.members ?? []).map(full), ai: [], former: [...(options.former ?? [])], groups: [...(options.groups ?? [])], files, notifications: [], badges: new Map(), acknowledged: [], emit: async () => 0, upload: async () => new Response(), published: [], linked: Object.fromEntries(Object.entries(options.linked ?? {}).map(([t, l]) => [t, [...l]])), delivery: { mail: options.delivery?.mail ?? "ready", webhooks: options.delivery?.webhooks ?? "ready" }, deliver: async () => 0, checks: [], check: async () => 0, outbox: [], held: [], egress: [], clearCaches: () => {}, receive: async () => 0, calendar: new Map(), feed: () => "", feedUrl: () => "", newFeedUrl: () => "", bounce: async () => 0, schedules: [...(options.schedules ?? [])], theme: { all: options.theme?.all ?? null, tools: { ...options.theme?.tools } }, themeFiles: new Map(Object.entries(options.themeFiles ?? {}).map(([path, f]) => [path, { data: typeof f.data === "string" ? new TextEncoder().encode(f.data) : f.data, type: f.type ?? "application/octet-stream" }])), runs: [], run: async () => 0, webhooks: { targets: [], deliveries: [], events: [], to: options.webhooks?.to ?? null, respond: () => {}, retry: async () => 0 }, tools: {}, installTool: () => {}, removeTool: () => {}, close: async () => {} };
  const former = chest.former;
  let window = 0, calls = 0;
  // matchEmails' day (Proposal (studio.15)): the distinct addresses asked.
  const matchDay = { start: 0, count: 0 }, matchedToday = new Set<string>();
  // A member's groups as the tool sees them in the members API: those that
  // give the tool (0.3.0's meaning). All of a member's groups are answered
  // by groups.of, with "groups" (Proposal (studio)).
  const seenGroups = (ids: string[]) => ids.filter(g => chest.groups.find(x => x.id === g)?.grants !== false);
  const shown = (given: Member) => {
    // A member a test pushed without a language or a zone reads as the Chest
    // gives them (Proposal (studio)).
    const m = full(given);
    return { id: m.id, first_name: m.firstName, last_name: m.lastName, name: m.name, photo: m.photo, role: m.role, admin: m.isAdmin, builder: m.isBuilder, groups: seenGroups(m.groups), language: m.language, time_zone: m.timeZone, ...(email && m.email !== undefined ? { email: m.email } : {}), ...(m.mailPreference === undefined ? {} : { mail_pref: m.mailPreference }) };
  };
  const key = (m: Member) => fold(m.name) + "\u0000" + m.id;
  const described = (name: string, f: FakeFile) => ({ name, type: f.type, size: f.data.byteLength, updated: f.updated });

  async function members(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (!capabilities.has("members")) return send(response, 403, { error: "capability_not_granted" });
    const now = Date.now();
    if (now - window >= 60_000) [window, calls] = [now, 0];
    if (++calls > callsPerMinute) return send(response, 429, { error: "rate_limited" }, { "Retry-After": "60" });
    if (request.method === "GET" && url.pathname === "/members") {
      const q = url.searchParams, keys = [...q.keys()];
      const limit = q.has("limit") ? Number(q.get("limit")) : defaultLimit;
      const after = q.has("after") ? Buffer.from(q.get("after")!, "base64url").toString() : "";
      if (q.has("after") && !memberIdPattern.test(after.split("\u0000")[1] ?? "")) return send(response, 400, { error: "invalid_query" });
      const group = q.get("group"), role = q.get("role"), search = fold(q.get("q") ?? "");
      if (keys.some(k => !["after", "limit", "q", "role", "group"].includes(k) || q.getAll(k).length !== 1) || !Number.isInteger(limit) || limit < 1 || limit > maxLimit || String(limit) !== (q.get("limit") ?? String(defaultLimit)) || (group !== null && !groupIdPattern.test(group)) || search.length > 64) return send(response, 400, { error: "invalid_query" });
      const shownList = chest.members
        .filter(m => (role === null || m.role === role) && (group === null || m.groups.includes(group)) && (search === "" || [m.firstName, m.lastName, m.name, ...(email && m.email ? [m.email] : [])].some(n => fold(n).startsWith(search))))
        .filter(m => after === "" || key(m) > after)
        .sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
      const page = shownList.slice(0, limit);
      return send(response, 200, { members: page.map(shown), next: shownList.length > limit ? Buffer.from(key(page.at(-1)!)).toString("base64url") : null });
    }
    if (request.method === "POST" && url.pathname === "/members/lookup") {
      const raw = await body(request, 64 << 10);
      let ids: unknown;
      try { ids = (JSON.parse(raw?.toString() ?? "") as { ids?: unknown }).ids; } catch { ids = undefined; }
      if (!Array.isArray(ids) || ids.length > maxLookup) return send(response, 400, { error: "invalid_body" });
      if (!ids.every(id => typeof id === "string" && memberIdPattern.test(id))) return send(response, 400, { error: "invalid_id" });
      const answer = { members: [] as unknown[], former: [] as unknown[], unknown: [] as string[] };
      for (const id of new Set(ids as string[])) {
        const m = chest.members.find(x => x.id === id), f = former.find(x => x.id === id);
        if (m) answer.members.push(shown(m));
        else if (f?.erased) answer.former.push({ id, status: "erased", ...(f.leftAt ? { left_at: f.leftAt } : {}) });
        else if (f) answer.former.push({ id, ...(f.name ? { name: f.name } : {}), status: "former", ...(f.leftAt ? { left_at: f.leftAt } : {}) });
        else answer.unknown.push(id);
      }
      return send(response, 200, answer);
    }
    // Proposal (studio.15): which addresses are members who have the tool.
    if (request.method === "POST" && url.pathname === "/members/match") {
      const raw = await body(request, 128 << 10);
      let emails: unknown;
      try { emails = (JSON.parse(raw?.toString() ?? "") as { emails?: unknown }).emails; } catch { emails = undefined; }
      if (!Array.isArray(emails) || emails.length > matchPerCall || !emails.every(e => typeof e === "string" && e.length <= 254)) return send(response, 400, { error: "invalid_body" });
      const asked = [...new Set((emails as string[]).map(e => e.trim().toLowerCase()))];
      if (!live(matchDay, 86_400_000, now)) {
        [matchDay.start, matchDay.count] = [now, 0];
        matchedToday.clear();
      }
      const fresh = asked.filter(e => !matchedToday.has(e));
      if (matchedToday.size + fresh.length > matchPerDay) return send(response, 429, { error: "quota_exceeded" }, wait(matchDay, 86_400_000, now));
      for (const e of fresh) matchedToday.add(e);
      matchDay.count = matchedToday.size;
      const matches = asked.flatMap(e => {
        const m = chest.members.find(x => x.email !== undefined && x.email.toLowerCase() === e);
        return m ? [{ email: e, id: m.id }] : [];
      });
      return send(response, 200, { matches });
    }
    if (request.method === "GET" && url.pathname.startsWith("/members/")) {
      const id = url.pathname.slice("/members/".length);
      if (!memberIdPattern.test(id)) return send(response, 400, { error: "invalid_id" });
      const m = chest.members.find(x => x.id === id);
      return m ? send(response, 200, shown(m)) : send(response, 404, { error: "member_not_found" });
    }
    if (request.method === "GET" && url.pathname === "/groups") return send(response, 200, { groups: chest.groups.filter(g => g.grants !== false).map(g => ({ id: g.id, name: g.name, members: g.members })) });
    // Proposal (studio): every group of the Chest, and who is in one, for
    // a tool that holds "groups" — among the members who have the tool.
    if (request.method === "GET" && (url.pathname === "/groups/all" || /^\/groups\/[^/]+\/members$/u.test(url.pathname) || url.pathname.startsWith("/groups/of/"))) {
      if (!capabilities.has("groups")) return send(response, 403, { error: "capability_not_granted" });
      const has = new Set(chest.members.map(m => m.id));
      if (url.pathname.startsWith("/groups/of/")) {
        const id = url.pathname.slice("/groups/of/".length);
        if (!memberIdPattern.test(id)) return send(response, 400, { error: "invalid_id" });
        const m = chest.members.find(x => x.id === id);
        if (!m) return send(response, 404, { error: "member_not_found" });
        // Every group of the Chest the member is in: those the test gave
        // them, and those that name them among their members.
        const ids = new Set([...m.groups, ...chest.groups.filter(g => g.members.includes(id)).map(g => g.id)]);
        return send(response, 200, { groups: [...ids].filter(g => groupIdPattern.test(g)).sort() });
      }
      if (url.pathname === "/groups/all") {
        const all = [...chest.groups].sort((a, b) => fold(a.name) < fold(b.name) ? -1 : fold(a.name) > fold(b.name) ? 1 : a.id < b.id ? -1 : 1);
        return send(response, 200, { groups: all.map(g => ({ id: g.id, name: g.name, size: g.members.filter(id => has.has(id)).length })) });
      }
      const id = url.pathname.split("/")[2]!;
      if (!groupIdPattern.test(id)) return send(response, 400, { error: "invalid_id" });
      const group = chest.groups.find(g => g.id === id);
      if (!group) return send(response, 404, { error: "group_not_found" });
      const q = url.searchParams;
      const limit = q.has("limit") ? Number(q.get("limit")) : 500;
      const after = q.get("after") ?? "";
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || (after !== "" && !memberIdPattern.test(after))) return send(response, 400, { error: "invalid_query" });
      const ids = group.members.filter(m => has.has(m) && m > after).sort();
      return send(response, 200, { members: ids.slice(0, limit), next: ids.length > limit ? ids[limit - 1]! : null });
    }
    send(response, 404, { error: "not_found" });
  }

  async function filesRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    sweep();
    if (!capabilities.has("files")) return send(response, 403, { error: "capability_not_granted" });
    if (request.method === "GET" && url.pathname === "/files") {
      const prefix = url.searchParams.get("prefix") ?? "", after = url.searchParams.get("after") ?? "";
      const names = [...files.keys()].filter(n => n.startsWith(prefix) && n > after).sort();
      return send(response, 200, { files: names.slice(0, 1000).map(n => described(n, files.get(n)!)), next: names.length > 1000 ? names[999] : null });
    }
    if (request.method === "POST" && url.pathname === "/files/url") {
      const raw = await body(request, 4096);
      let name: unknown;
      try { name = (JSON.parse(raw?.toString() ?? "") as { name?: unknown }).name; } catch { name = undefined; }
      if (typeof name !== "string") return send(response, 400, { error: "invalid_body" });
      if (!files.has(name)) return send(response, 404, { error: "not_found" });
      return send(response, 200, { url: `${origin}/_chest/files/${Buffer.from(name).toString("base64url")}.fake`, expires_in: 900 });
    }
    if (request.method === "POST" && (url.pathname === "/files/move" || url.pathname === "/files/upload-url" || url.pathname === "/files/claim")) {
      const raw = await body(request, 4096);
      let command: Record<string, unknown> = {};
      try { command = JSON.parse(raw?.toString() ?? "") as Record<string, unknown>; } catch { command = {}; }
      if (url.pathname === "/files/claim") {
        sweep();
        const token = command["claim"];
        const c = typeof token === "string" ? claims.get(token) : undefined;
        if (!c || !files.has(c.name)) return send(response, 404, { error: "not_found" });
        claims.delete(token as string);
        const object = files.get(c.name)!;
        return send(response, 200, described(c.name, object));
      }
      if (url.pathname === "/files/upload-url") {
        // The upload itself goes from a member's browser to the team host:
        // the fake Chest's front receives it (PUT /_chest/files/upload/…,
        // or chest.upload in a test), once, within its bounds.
        const name = command["name"], types = command["types"], maxSize = command["max_size"], life = command["expires_in"], isPublic = command["public"] === true, unclaimed = command["expires_unclaimed_after"];
        if (typeof name !== "string" || !(name.endsWith("/") ? namePattern.test(name.slice(0, -1)) : namePattern.test(name))) return send(response, 400, { error: "invalid_name" });
        if (types !== undefined && (!Array.isArray(types) || !types.every(t => typeof t === "string"))) return send(response, 400, { error: "invalid_type" });
        if (isPublic && !storage.publicUploads) return send(response, 403, { error: "capability_not_granted" });
        if (isPublic && !name.startsWith("uploads/public/")) return send(response, 400, { error: "invalid_name" });
        const expiresIn = typeof life === "number" ? life : 900;
        const token = randomBytes(18).toString("base64url") + ".up";
        const bound = isPublic ? publicMaxObject : maxObject;
        uploads.set(token, { name, types: (types as string[] | undefined) ?? [], maxSize: typeof maxSize === "number" ? Math.min(maxSize, bound) : bound, expires: Date.now() + expiresIn * 1000, public: isPublic, ...(typeof unclaimed === "number" ? { unclaimed } : {}) });
        return send(response, 200, { url: isPublic ? `${publicOrigin}/_chest/upload/${token}` : `${origin}/_chest/files/upload/${token}`, method: "PUT", expires_in: expiresIn });
      }
      const from = command["from"], to = command["to"];
      if (typeof from !== "string" || typeof to !== "string" || !namePattern.test(from) || !namePattern.test(to)) return send(response, 400, { error: "invalid_name" });
      const moving = files.get(from);
      if (!moving) return send(response, 404, { error: "not_found" });
      files.delete(from);
      files.set(to, moving);
      return send(response, 200, described(to, moving));
    }
    const name = decodeURIComponent(url.pathname.slice("/files/".length));
    if (!namePattern.test(name)) return send(response, 400, { error: "invalid_name" });
    const object = files.get(name);
    if (request.method === "PUT") {
      const data = await body(request, maxObject);
      if (data === null) return send(response, 413, { error: "too_large" });
      const total = [...files.entries()].reduce((sum, [n, f]) => n === name ? sum : sum + f.data.byteLength, 0);
      if (total + data.length > maxTotal || (!object && files.size >= maxObjects)) return send(response, 429, { error: "quota_exceeded" });
      const kept = { data: new Uint8Array(data), type: request.headers["content-type"] ?? "application/octet-stream", updated: new Date().toISOString() };
      files.set(name, kept);
      return send(response, 201, described(name, kept));
    }
    if (!object) return send(response, 404, { error: "not_found" });
    if (request.method === "GET" && url.searchParams.has("stat")) return send(response, 200, described(name, object));
    if (request.method === "GET") return void response.writeHead(200, { "Content-Type": object.type, "Content-Length": String(object.data.byteLength) }).end(object.data);
    if (request.method === "DELETE") {
      files.delete(name);
      return send(response, 204);
    }
    send(response, 404, { error: "not_found" });
  }

  // The windows of the notification quotas, each from the first call it
  // counts: the tool's recipients this hour, each member's items this day,
  // the tool's badge writes this minute.
  type Window = { start: number; count: number };
  const hour: Window = { start: 0, count: 0 }, minute: Window = { start: 0, count: 0 }, broadcasts: Window = { start: 0, count: 0 }, days = new Map<string, Window>();
  const live = (w: Window | undefined, span: number, now: number): boolean => w !== undefined && w.count > 0 && now - w.start < span;
  const wait = (w: Window, span: number, now: number): Record<string, string> => ({ "Retry-After": String(Math.max(1, Math.ceil((w.start + span - now) / 1000))) });
  const count = (w: Window, span: number, now: number, n: number): void => {
    if (!live(w, span, now)) [w.start, w.count] = [now, 0];
    w.count += n;
  };
  const access = (id: string) => chest.members.some(m => m.id === id);
  // drop removes kept notifications in place: a test may hold the list.
  const drop = (gone: (n: FakeNotification) => boolean): void => {
    for (let i = chest.notifications.length - 1; i >= 0; i--) if (gone(chest.notifications[i]!)) chest.notifications.splice(i, 1);
  };
  // recipients reads 1 to 500 member identifiers, each once.
  function recipients(value: unknown): string[] | { error: string } {
    if (!Array.isArray(value) || value.length < 1 || value.length > maxRecipients) return { error: "invalid_body" };
    if (!value.every(v => typeof v === "string" && memberIdPattern.test(v))) return { error: "invalid_id" };
    return [...new Set(value as string[])];
  }

  async function notificationsRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (!capabilities.has("notifications")) return send(response, 403, { error: "capability_not_granted" });
    const badge = request.method === "PUT" && url.pathname.startsWith("/badges/");
    if (!badge && !(request.method === "PUT" && url.pathname === "/badges") && !(request.method === "POST" && (url.pathname === "/notifications" || url.pathname === "/notifications/withdraw" || url.pathname === "/notifications/broadcast"))) return send(response, 404, { error: "not_found" });
    const raw = await body(request, 64 << 10);
    let command: Record<string, unknown> | null = null;
    try {
      const value = JSON.parse(raw?.toString() ?? "") as unknown;
      if (value !== null && typeof value === "object" && !Array.isArray(value)) command = value as Record<string, unknown>;
    } catch {
      command = null;
    }
    const keys = (...allowed: string[]) => command !== null && Object.keys(command).every(k => allowed.includes(k));
    const now = Date.now();
    if (badge || url.pathname === "/badges") {
      let writes: { member: string; count: number }[];
      if (badge) {
        const id = url.pathname.slice("/badges/".length);
        if (!memberIdPattern.test(id)) return send(response, 400, { error: "invalid_id" });
        if (!keys("count") || !("count" in command!)) return send(response, 400, { error: "invalid_body" });
        writes = [{ member: id, count: command!["count"] as number }];
      } else {
        const list = command?.["badges"];
        if (!keys("badges") || !Array.isArray(list) || list.length < 1 || list.length > maxRecipients || !list.every(b => b !== null && typeof b === "object" && !Array.isArray(b) && Object.keys(b).every(k => k === "member" || k === "count"))) return send(response, 400, { error: "invalid_body" });
        writes = list as { member: string; count: number }[];
        if (!writes.every(b => typeof b.member === "string" && memberIdPattern.test(b.member))) return send(response, 400, { error: "invalid_id" });
      }
      if (!writes.every(b => typeof b.count === "number" && Number.isInteger(b.count) && b.count >= 0 && b.count <= maxCount)) return send(response, 400, { error: "invalid_count" });
      if (new Set(writes.map(b => b.member)).size !== writes.length) return send(response, 400, { error: "invalid_body" });
      if (live(minute, 60_000, now) && minute.count + writes.length > badgesPerMinute) return send(response, 429, { error: "quota_exceeded" }, wait(minute, 60_000, now));
      count(minute, 60_000, now, writes.length);
      const answer = { set: [] as string[], skipped: [] as string[] };
      for (const b of writes) {
        if (!access(b.member)) {
          answer.skipped.push(b.member);
          continue;
        }
        if (b.count === 0) chest.badges.delete(b.member);
        else chest.badges.set(b.member, b.count);
        answer.set.push(b.member);
      }
      return send(response, 200, answer);
    }
    if (url.pathname === "/notifications/withdraw") {
      if (!keys("key", "members")) return send(response, 400, { error: "invalid_body" });
      const key = command!["key"];
      if (typeof key !== "string" || !keyPattern.test(key)) return send(response, 400, { error: "invalid_key" });
      const named = command!["members"] === undefined ? null : recipients(command!["members"]);
      if (named !== null && !Array.isArray(named)) return send(response, 400, named);
      drop(n => n.key === key && (named === null || named.includes(n.member)));
      return send(response, 204);
    }
    if (url.pathname === "/notifications/broadcast") {
      // Proposal (studio): everyone who has the tool (or some roles or
      // groups), each in their language; 30 broadcasts an hour.
      if (options.broadcast === false) return send(response, 404, { error: "not_found" });
      if (!keys("messages", "path", "key", "to", "except")) return send(response, 400, { error: "invalid_body" });
      const except = new Set(Array.isArray(command!["except"]) ? (command!["except"] as string[]) : []);
      const messages = command!["messages"] as Record<string, { title?: unknown; body?: unknown }> | undefined;
      if (!messages || typeof messages !== "object" || !messages["en"]) return send(response, 400, { error: "invalid_body" });
      for (const m of Object.values(messages)) {
        if (typeof m?.title !== "string" || [...m.title].length < 1 || [...m.title].length > maxTitle || cleanTitle(m.title) === "") return send(response, 400, { error: "invalid_title" });
        if (m.body !== undefined && (typeof m.body !== "string" || [...m.body].length > maxText)) return send(response, 400, { error: "invalid_text" });
      }
      const { path, key } = command!;
      if (path !== undefined && !isPath(path)) return send(response, 400, { error: "invalid_path" });
      if (key !== undefined && (typeof key !== "string" || !keyPattern.test(key))) return send(response, 400, { error: "invalid_key" });
      const to = (command!["to"] ?? {}) as { roles?: string[]; groups?: string[] };
      if (live(broadcasts, 3_600_000, now) && broadcasts.count >= 30) return send(response, 429, { error: "quota_exceeded" }, wait(broadcasts, 3_600_000, now));
      count(broadcasts, 3_600_000, now, 1);
      const everyone = !to.roles && !to.groups;
      let told = 0;
      for (const m of chest.members) {
        if (except.has(m.id)) continue;
        if (!everyone && !(to.roles ?? []).includes(m.role ?? "") && !m.groups.some(g => (to.groups ?? []).includes(g))) continue;
        const w = days.get(m.id);
        if (w && live(w, 86_400_000, now) && w.count >= itemsPerDay) continue;
        if (!days.has(m.id)) days.set(m.id, { start: 0, count: 0 });
        count(days.get(m.id)!, 86_400_000, now, 1);
        const words = messages[m.language] ?? messages["en"]!;
        if (key !== undefined) drop(n => n.member === m.id && n.key === key);
        const text = typeof words.body === "string" ? cleanText(words.body) : "";
        chest.notifications.push({ member: m.id, title: cleanTitle(words.title as string), ...(text ? { body: text } : {}), path: (path as string | undefined) ?? "/chest", ...(key !== undefined ? { key: key as string } : {}) });
        told++;
      }
      return send(response, 200, { delivered: told });
    }
    if (!keys("members", "title", "body", "path", "key")) return send(response, 400, { error: "invalid_body" });
    const { title, body: text, path, key } = command!;
    const ids = recipients(command!["members"]);
    if (!Array.isArray(ids)) return send(response, 400, ids);
    if (typeof title !== "string" || [...title].length < 1 || [...title].length > maxTitle || cleanTitle(title) === "") return send(response, 400, { error: "invalid_title" });
    if (text !== undefined && (typeof text !== "string" || [...text].length > maxText)) return send(response, 400, { error: "invalid_text" });
    if (path !== undefined && !isPath(path)) return send(response, 400, { error: "invalid_path" });
    if (key !== undefined && (typeof key !== "string" || !keyPattern.test(key))) return send(response, 400, { error: "invalid_key" });
    const kept = ids.filter(access);
    if (live(hour, 3_600_000, now) && hour.count + kept.length > recipientsPerHour) return send(response, 429, { error: "quota_exceeded" }, wait(hour, 3_600_000, now));
    const full = kept.map(id => days.get(id)).filter((w): w is Window => live(w, 86_400_000, now) && w!.count >= itemsPerDay);
    if (full.length > 0) return send(response, 429, { error: "quota_exceeded" }, wait(full.reduce((a, b) => a.start > b.start ? a : b), 86_400_000, now));
    count(hour, 3_600_000, now, kept.length);
    const cleaned = typeof text === "string" ? cleanText(text) : "";
    for (const id of kept) {
      if (!days.has(id)) days.set(id, { start: 0, count: 0 });
      count(days.get(id)!, 86_400_000, now, 1);
      if (key !== undefined) drop(n => n.member === id && n.key === key);
      chest.notifications.push({ member: id, title: cleanTitle(title), ...(cleaned ? { body: cleaned } : {}), path: (path as string | undefined) ?? "/chest", ...(key !== undefined ? { key: key as string } : {}) });
    }
    send(response, 200, { delivered: kept, skipped: ids.filter(id => !access(id)) });
  }

  // Checks run by the Chest (Proposal (studio)): the list the tool configured.
  async function checksRoute(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!options.checks) return send(response, 404, { error: "not_found" });
    if (request.method === "GET") return send(response, 200, { checks: chest.checks });
    if (request.method !== "PUT") return send(response, 404, { error: "not_found" });
    const raw = await body(request, 16 << 10);
    let c: Record<string, unknown>;
    try { c = JSON.parse(raw?.toString() ?? "") as Record<string, unknown>; } catch { return send(response, 400, { error: "invalid_checks" }); }
    const given = c["checks"];
    if (!Array.isArray(given)) return send(response, 400, { error: "invalid_checks" });
    if (given.length > options.checks.max) return send(response, 429, { error: "quota_exceeded" });
    chest.checks = given as FakeChest["checks"];
    send(response, 200, { checks: chest.checks });
  }

  // Webhooks (Proposal (studio)): the targets the tool added, the
  // deliveries the Chest makes to them, as the Chest would — checks, ping,
  // signature, retries, disabling — without the network.
  const hooks = chest.webhooks;
  const hookOptions = options.webhooks;
  const answers = new Map<string, FakeWebhookAnswer>();
  const hookKeys = new Map<string, FakeWebhookDelivery>();
  let hookAdds: Window = { start: 0, count: 0 }, hookHour: Window = { start: 0, count: 0 };
  const hookId = (prefix: string) => prefix + Array.from(randomBytes(26), b => "abcdefghijklmnopqrstuvwxyz234567"[b & 31]).join("");
  const hookSecret = () => "whsec_" + randomBytes(32).toString("base64url");
  const shownTarget = (t: FakeWebhookTarget) => ({ id: t.id, kind: t.kind, label: t.label, owner: t.owner, url: t.url, state: t.state, status: t.status, last_error: t.lastError, last_at: t.lastAt, failures: t.failures, created_at: t.createdAt });
  const shownDelivery = (d: FakeWebhookDelivery) => ({ id: d.id, target: d.target, event: d.event, key: d.key, status: d.status, attempts: d.attempts, response_status: d.responseStatus, last_error: d.lastError, created_at: d.createdAt, delivered_at: d.deliveredAt, next_attempt_at: d.nextAttemptAt });
  // resolveHost plays DNS and the Chest's rule on what a name resolves to.
  const resolveHost = (host: string): "ok" | "dns" | "private_address" => {
    const literal = host.startsWith("[") ? host.slice(1, -1) : host;
    const address = hookOptions?.resolve?.[literal] ?? (/^[0-9.]+$|:/u.test(literal) ? literal : "93.184.215.14");
    if (address === "nxdomain") return "dns";
    return isPublicAddress(address) ? "ok" : "private_address";
  };
  // post makes one POST as the Chest would: to the test's receiver, or
  // answered as respond() said.
  async function post(key: string[], fullUrl: string, headers: Record<string, string>, body: string): Promise<{ status: number | null; error: string | null }> {
    const reach = resolveHost(new URL(fullUrl).hostname);
    if (reach !== "ok") return { status: null, error: reach };
    if (hookOptions?.deliver) {
      try {
        const answer = await hookOptions.deliver(fullUrl, { method: "POST", headers, body });
        const status = typeof answer === "number" ? answer : answer.status;
        if (typeof answer !== "number") await answer.body?.cancel();
        return status >= 300 && status < 400 ? { status, error: "redirect" } : { status, error: status >= 200 && status < 300 ? null : `http_${status}` };
      } catch {
        return { status: null, error: "refused" };
      }
    }
    const answer = key.map(k => answers.get(k)).find(a => a !== undefined) ?? 200;
    if (typeof answer === "string") return { status: null, error: answer };
    return answer >= 300 && answer < 400 ? { status: answer, error: "redirect" } : { status: answer, error: answer >= 200 && answer < 300 ? null : `http_${answer}` };
  }
  const requestOf = (t: FakeWebhookTarget, id: string, event: string, body: string): Record<string, string> => ({
    "Content-Type": "application/json", "User-Agent": "Chest-Webhooks/1",
    ...(t.kind === "generic" ? { "Chest-Webhook-Id": id, "Chest-Webhook-Event": event, "Chest-Webhook-Signature": signWebhook(t.secrets, body, Math.floor(Date.now() / 1000)) } : {}),
  });
  // ping: a generic address answers a signed chest.ping with a 2xx.
  async function ping(t: FakeWebhookTarget): Promise<boolean> {
    const id = hookId("whd_");
    const body = formatWebhook("generic", { id, event: "chest.ping", text: "Ping from your Chest: this address will receive notices from " + tool + ".", data: { challenge: randomBytes(16).toString("base64url") }, key: "ping", tool, createdAt: new Date().toISOString() });
    const answer = await post([t.id, t.fullUrl], t.fullUrl, requestOf(t, id, "chest.ping", body), body);
    return answer.error === null;
  }
  async function disable(t: FakeWebhookTarget, reason: "failures" | "gone"): Promise<void> {
    t.state = "disabled";
    t.status = "disabled";
    for (const d of hooks.deliveries) if (d.target === t.id && (d.status === "pending" || d.status === "retrying")) Object.assign(d, { status: "failed", lastError: "disabled", nextAttemptAt: null });
    const id = hookId("whe_");
    const body = JSON.stringify({ id, type: "webhook.disabled", at: new Date().toISOString(), target: t.id, reason, last_error: t.lastError });
    const kept: FakeWebhooks["events"][number] = { id, type: "webhook.disabled", target: t.id, reason, lastError: t.lastError, status: null };
    hooks.events.push(kept);
    const to = hooks.to;
    if (!to) return;
    const request = new Request((typeof to === "string" ? to.replace(/\/$/u, "") : "http://tool.test") + "/chest-webhooks", { method: "POST", headers: { "Content-Type": "application/json", "Chest-Webhooks": signEvent(id, body, { token, tool, label: "Chest-Webhooks v1" }) }, body });
    try {
      const answer = typeof to === "string" ? await fetch(request, { redirect: "manual" }) : await to(request);
      await answer.body?.cancel();
      kept.status = answer.status;
    } catch {
      kept.status = null;
    }
  }
  // attempt: one try of a delivery, and what follows from its answer.
  async function attempt(d: FakeWebhookDelivery): Promise<void> {
    const t = hooks.targets.find(x => x.id === d.target);
    if (!t || t.state === "disabled") return void Object.assign(d, { status: "failed", lastError: "disabled", nextAttemptAt: null });
    const body = formatWebhook(t.kind, { id: d.id, event: d.event, text: d.text, ...(d.data ? { data: d.data } : {}), key: d.key, tool, createdAt: d.createdAt });
    const headers = requestOf(t, d.id, d.event, body);
    const answer = await post([t.id, t.fullUrl], t.fullUrl, headers, body);
    const now = new Date().toISOString();
    d.attempts++;
    d.request = { url: t.fullUrl, headers, body };
    d.responseStatus = answer.status;
    d.lastError = answer.error;
    t.lastAt = now;
    if (answer.error === null) {
      Object.assign(d, { status: "delivered", deliveredAt: now, nextAttemptAt: null });
      Object.assign(t, { status: "delivered", lastError: null, failures: 0 });
      return;
    }
    Object.assign(t, { status: "failed", lastError: answer.error, failures: t.failures + 1 });
    const status = answer.status;
    const gone = status === 410 || (t.kind !== "generic" && status === 404);
    const again = status === null || status === 408 || status === 429 || status >= 500;
    if (gone || t.failures >= webhookLimits.failuresToDisable) {
      d.status = "failed";
      d.nextAttemptAt = null;
      return disable(t, gone ? "gone" : "failures");
    }
    if (again && d.attempts < webhookLimits.attempts.length) {
      d.status = "retrying";
      d.nextAttemptAt = new Date(Date.parse(d.createdAt) + webhookLimits.attempts[d.attempts]! * 1000).toISOString();
    } else Object.assign(d, { status: "failed", nextAttemptAt: null });
  }
  hooks.respond = (target, answer) => void answers.set(target, answer);
  hooks.retry = async () => {
    const due = hooks.deliveries.filter(d => d.status === "retrying");
    for (const d of due) await attempt(d);
    return due.length;
  };
  async function webhooksRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    // options.webhooks is the permission approved; without it, 403.
    if (!hookOptions) return send(response, 403, { error: "capability_not_granted" });
    const now = Date.now();
    const readBody = async (): Promise<Record<string, unknown> | null> => {
      const raw = await body(request, 64 << 10);
      try { const v = JSON.parse(raw?.toString() ?? "") as unknown; return v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null; } catch { return null; }
    };
    // Proposal (studio.16): whether the Chest would deliver, without sending.
    if (url.pathname === "/webhooks/status" && request.method === "GET") return send(response, 200, { state: chest.delivery.webhooks, targets: hooks.targets.length, max: hookOptions.max });
    // Paused by the owner: nothing is added or sent.
    if (chest.delivery.webhooks === "suspended" && request.method === "POST" && (url.pathname === "/webhooks" || url.pathname === "/webhooks/send")) return send(response, 409, { error: "suspended" });
    if (url.pathname === "/webhooks" && request.method === "GET") return send(response, 200, { targets: hooks.targets.map(shownTarget) });
    if (url.pathname === "/webhooks" && request.method === "POST") {
      const given = await readBody();
      // The Chest checks what the SDK checked: the same rules.
      if (!given || checkWebhookInput(given).length > 0) return send(response, 400, { error: "invalid_target" });
      if (hooks.targets.length >= hookOptions.max) return send(response, 429, { error: "quota_exceeded" });
      if (!live(hookAdds, 3_600_000, now)) hookAdds = { start: now, count: 0 };
      if (hookAdds.count >= webhookLimits.addsPerHour) return send(response, 429, { error: "quota_exceeded" }, wait(hookAdds, 3_600_000, now));
      const fullUrl = given["url"] as string, kind = given["kind"] as WebhookKind;
      if (resolveHost(new URL(fullUrl).hostname) !== "ok") return send(response, 422, { error: "address_refused" });
      hookAdds.count++;
      const t: FakeWebhookTarget = { id: hookId("whk_"), kind, label: (given["label"] as string).trim(), owner: typeof given["owner"] === "string" ? given["owner"] : null, url: shownUrl(fullUrl, kind), state: "active", status: null, lastError: null, lastAt: null, failures: 0, createdAt: new Date(now).toISOString(), fullUrl, secrets: kind === "generic" ? [hookSecret()] : [] };
      if (kind === "generic" && !(await ping(t))) return send(response, 422, { error: "verification_failed" });
      hooks.targets.push(t);
      return send(response, 201, { id: t.id, secret: t.secrets[0] ?? null, target: shownTarget(t) });
    }
    if (url.pathname === "/webhooks/send" && request.method === "POST") {
      const given = await readBody();
      const ids = given?.["targets"];
      if (!given || !Array.isArray(ids) || ids.length < 1 || ids.length > webhookLimits.perSend || !ids.every(i => typeof i === "string" && webhookTargetPattern.test(i))) return send(response, 400, { error: "invalid_message" });
      const { targets: _targets, ...message } = given;
      void _targets;
      if (checkWebhookMessage(message).length > 0) return send(response, 400, { error: "invalid_message" });
      const key = message["key"] as string;
      if (!wireKeyPattern.test(key)) return send(response, 400, { error: "invalid_message" });
      const fresh = (d: FakeWebhookDelivery | undefined) => d !== undefined && now - Date.parse(d.createdAt) < 86_400_000;
      // A key names one delivery per target: the same key for another
      // event is refused, nothing sent (studio.15).
      if ((ids as string[]).some(id => { const d = hookKeys.get(id + "\u0000" + key); return fresh(d) && d!.event !== message["event"]; })) return send(response, 409, { error: "key_conflict" });
      const plan = [...new Set(ids as string[])].map(id => {
        const t = hooks.targets.find(x => x.id === id);
        if (!t) return { id, skip: "not_found" as const };
        const first = hookKeys.get(id + "\u0000" + key);
        if (fresh(first)) return { id, existing: first! };
        if (t.state === "disabled") return { id, skip: "disabled" as const };
        return { id, target: t };
      });
      const count = plan.filter(p => "target" in p).length;
      if (!live(hookHour, 3_600_000, now)) hookHour = { start: now, count: 0 };
      if (hookHour.count + count > webhookLimits.deliveriesPerHour) return send(response, 429, { error: "quota_exceeded" }, wait(hookHour, 3_600_000, now));
      hookHour.count += count;
      const answer: { deliveries: { id: string; target: string }[]; skipped: { target: string; reason: string }[] } = { deliveries: [], skipped: [] };
      for (const p of plan) {
        if ("skip" in p) { answer.skipped.push({ target: p.id, reason: p.skip! }); continue; }
        if ("existing" in p) { answer.deliveries.push({ id: p.existing!.id, target: p.id }); continue; }
        const d: FakeWebhookDelivery = { id: hookId("whd_"), target: p.id, event: message["event"] as string, key, status: "pending", attempts: 0, responseStatus: null, lastError: null, createdAt: new Date(now).toISOString(), deliveredAt: null, nextAttemptAt: null, text: message["text"] as string, ...(message["data"] ? { data: message["data"] as Record<string, unknown> } : {}), request: null };
        hooks.deliveries.push(d);
        hookKeys.set(p.id + "\u0000" + key, d);
        answer.deliveries.push({ id: d.id, target: p.id });
      }
      // The Chest answers at once and delivers within seconds; the fake
      // makes each first attempt before it answers, so a test reads the
      // outcome right after send().
      for (const p of answer.deliveries) {
        const d = hooks.deliveries.find(x => x.id === p.id)!;
        if (d.status === "pending") await attempt(d);
      }
      return send(response, 200, answer);
    }
    if (url.pathname === "/webhooks/deliveries" && request.method === "GET") {
      const q = url.searchParams;
      const limit = q.has("limit") ? Number(q.get("limit")) : 100;
      const after = q.get("after"), target = q.get("target");
      if (!Number.isInteger(limit) || limit < 1 || limit > 500 || (after !== null && !webhookDeliveryPattern.test(after)) || (target !== null && !webhookTargetPattern.test(target))) return send(response, 400, { error: "invalid_query" });
      const all = hooks.deliveries.filter(d => (target === null || d.target === target) && now - Date.parse(d.createdAt) < 30 * 86_400_000).reverse();
      const from = after === null ? 0 : all.findIndex(d => d.id === after) + 1;
      const page = all.slice(from, from + limit);
      return send(response, 200, { deliveries: page.map(shownDelivery), next: from + limit < all.length ? page.at(-1)!.id : null });
    }
    const one = /^\/webhooks\/(whk_[a-z2-7]{26})(\/enable|\/secret)?$/u.exec(url.pathname);
    const t = one ? hooks.targets.find(x => x.id === one[1]) : undefined;
    if (!one) return send(response, 404, { error: "not_found" });
    if (!t) return send(response, 404, { error: "target_not_found" });
    if (one[2] === undefined && request.method === "DELETE") {
      hooks.targets.splice(hooks.targets.indexOf(t), 1);
      for (const d of hooks.deliveries) if (d.target === t.id && (d.status === "pending" || d.status === "retrying")) Object.assign(d, { status: "failed", lastError: "removed", nextAttemptAt: null });
      return send(response, 204);
    }
    if (one[2] === "/enable" && request.method === "POST") {
      if (resolveHost(new URL(t.fullUrl).hostname) !== "ok") return send(response, 422, { error: "address_refused" });
      if (t.kind === "generic" && !(await ping(t))) return send(response, 422, { error: "verification_failed" });
      Object.assign(t, { state: "active", status: t.status === "disabled" ? null : t.status, failures: 0, lastError: null });
      return send(response, 200, { target: shownTarget(t) });
    }
    if (one[2] === "/secret" && request.method === "POST") {
      if (t.kind !== "generic") return send(response, 400, { error: "no_secret" });
      // The old secret signs beside the new one (24 h on a real Chest; until
      // the next rotation here).
      t.secrets = [hookSecret(), t.secrets[0]!];
      return send(response, 200, { secret: t.secrets[0] });
    }
    send(response, 404, { error: "not_found" });
  }

  // Visitors of the public host (Proposal (studio)): counts per visitor
  // and name, per name, and per address across names (the Chest's
  // ceiling, 60 an hour unless options.visitors says otherwise).
  const visitorCounts = new Map<string, Window>();
  const perAddressHour = options.visitors?.perAddressHour ?? 60;
  async function visitorsRoute(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== "POST") return send(response, 404, { error: "not_found" });
    const raw = await body(request, 4 << 10);
    let c: Record<string, unknown>;
    try { c = JSON.parse(raw?.toString() ?? "") as Record<string, unknown>; } catch { return send(response, 400, { error: "invalid_body" }); }
    const name = c["name"], address = c["address"], perVisitor = c["per_visitor"], perHour = c["per_hour"];
    if (typeof name !== "string" || !/^[a-z][a-z0-9-]{0,31}$/u.test(name) || (address !== null && typeof address !== "string") || typeof perVisitor !== "number" || typeof perHour !== "number") return send(response, 400, { error: "invalid_body" });
    const now = Date.now();
    const who = (address as string | null) ?? "unknown";
    const windows = [[`v|${name}|${who}`, perVisitor], [`n|${name}`, perHour], [`a|${who}`, perAddressHour]] as const;
    for (const [k] of windows) if (!visitorCounts.has(k)) visitorCounts.set(k, { start: 0, count: 0 });
    const full = windows.find(([k, max]) => live(visitorCounts.get(k), 3_600_000, now) && visitorCounts.get(k)!.count >= max);
    if (full) {
      const w = visitorCounts.get(full[0])!;
      return send(response, 200, { allowed: false, retry_after: Math.max(1, Math.ceil((w.start + 3_600_000 - now) / 1000)) });
    }
    for (const [k] of windows) count(visitorCounts.get(k)!, 3_600_000, now, 1);
    send(response, 200, { allowed: true, retry_after: 0 });
  }

  // Events between tools (Proposal (studio)): what the tool publishes.
  const emits = new Set(options.emits ?? []);
  const publishedKeys = new Map<string, { id: string; fingerprint: string; at: number }>();
  async function eventsRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    // Proposal (studio.16): which tools receive a type this tool emits —
    // those an admin linked (chest.linked).
    if (url.pathname === "/events/receivers") {
      if (request.method !== "GET") return send(response, 404, { error: "not_found" });
      const type = url.searchParams.get("type") ?? "";
      if (!emits.has(type)) return send(response, 400, { error: "invalid_event" });
      return send(response, 200, { tools: [...new Set(chest.linked[type] ?? [])].sort() });
    }
    if (request.method !== "POST") return send(response, 404, { error: "not_found" });
    const raw = await body(request, 32 << 10);
    let e: Record<string, unknown>;
    try { e = JSON.parse(raw?.toString() ?? "") as Record<string, unknown>; } catch { return send(response, 400, { error: "invalid_event" }); }
    const type = e["type"], data = e["data"], key = e["key"], occurred = e["occurred_at"];
    if (typeof type !== "string" || !emits.has(type) || data === null || typeof data !== "object" || Array.isArray(data)) return send(response, 400, { error: "invalid_event" });
    if (key !== undefined && (typeof key !== "string" || !wireKeyPattern.test(key))) return send(response, 400, { error: "invalid_event" });
    // Proposal (studio.16): when it happened, within the last 24 hours and
    // not ahead beyond a minute — checked again against the Chest's clock.
    let occurredAt: string | undefined;
    if (occurred !== undefined) {
      try { occurredAt = occurredAtOf(occurred as string); } catch { return send(response, 400, { error: "invalid_event" }); }
    }
    // The same key within 24 hours is the same event — for the same type,
    // data and occurredAt only: another event under it is refused, never
    // answered with the first (studio.15).
    const fingerprint = JSON.stringify([type, data, occurredAt ?? null]);
    const first = typeof key === "string" ? publishedKeys.get(key) : undefined;
    const receiving = () => (chest.linked[type] ? new Set(chest.linked[type]).size : options.receivers ?? 0);
    if (first && Date.now() - first.at < 86_400_000) return first.fingerprint === fingerprint ? send(response, 200, { id: first.id, receivers: receiving() }) : send(response, 409, { error: "key_conflict" });
    const id = newId("evt_");
    chest.published.push({ id, type, data: data as Record<string, unknown>, ...(typeof key === "string" ? { key } : {}), occurredAt: occurredAt ?? new Date().toISOString() });
    if (typeof key === "string") publishedKeys.set(key, { id, fingerprint, at: Date.now() });
    send(response, 201, { id, receivers: receiving() });
  }

  // Mail (Proposal (studio)): send, status, mailboxes.
  const mailOptions = options.mail ?? {};
  const domain = mailOptions.domain ?? "company.test";
  const mailboxes = new Set(mailOptions.mailboxes ?? []);
  const suppressed = new Set((mailOptions.suppressed ?? []).map(a => a.toLowerCase()));
  // What a key answered, for 24 hours, and who it went to (studio.15).
  const sentKeys = new Map<string, { answer: Record<string, unknown>; recipients: string; at: number }>();
  const mailDay: Window = { start: 0, count: 0 };
  const newId = (prefix: string) => prefix + Array.from(randomBytes(26), b => "abcdefghijklmnopqrstuvwxyz234567"[b & 31]).join("");
  async function mailRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (!capabilities.has("mail")) return send(response, 404, { error: "not_found" });
    // Proposal (studio.16): whether the Chest would deliver, without sending.
    if (url.pathname === "/mail/status" && request.method === "GET") {
      const left = Math.max(0, (mailOptions.perDay ?? 500) - (live(mailDay, 86_400_000, Date.now()) ? mailDay.count : 0));
      return send(response, 200, { send: chest.delivery.mail, remaining_today: left });
    }
    const box = /^\/mail\/mailboxes\/([a-z][a-z0-9-]{0,31})$/u.exec(url.pathname);
    if (request.method === "GET" && box) return mailboxes.has(box[1]!) ? send(response, 200, { address: `${box[1]}@${domain}` }) : send(response, 404, { error: "not_found" });
    const one = /^\/mail\/messages\/(msg_[a-z2-7]{26})$/u.exec(url.pathname);
    if (request.method === "GET" && one) {
      const m = chest.outbox.find(x => x.id === one[1]);
      if (!m && chest.held.some(h => h.id === one[1])) return send(response, 200, { id: one[1], status: "held", at: new Date().toISOString() });
      return m ? send(response, 200, { id: m.id, status: m.status, at: new Date().toISOString() }) : send(response, 404, { error: "not_found" });
    }
    if (request.method !== "POST" || url.pathname !== "/mail/messages") return send(response, 404, { error: "not_found" });
    // A Chest whose owner has not connected mail sends nothing (as a Chest
    // without mail: CapabilityNotGranted); a suspended one is unavailable.
    if (chest.delivery.mail === "not_connected") return send(response, 404, { error: "not_found" });
    if (chest.delivery.mail === "suspended") return send(response, 503, { error: "unavailable" });
    const raw = await body(request, 16 << 20);
    if (raw === null) return send(response, 413, { error: "too_large" });
    let m: Record<string, unknown>;
    try { m = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { return send(response, 400, { error: "invalid_message" }); }
    const key = m["key"];
    if (key !== undefined && (typeof key !== "string" || !wireKeyPattern.test(key))) return send(response, 400, { error: "invalid_message" });
    // The same key within 24 hours answers the first message — for the
    // same recipients only: a key reused for others (a key cut by the
    // tool, which lost the recipient) is refused, nothing sent, never
    // answered with the first message (studio.15).
    const recipientsOf = (list: unknown) => (Array.isArray(list) ? list : []).map(r => (typeof r === "string" ? r.toLowerCase() : "member:" + String((r as { member?: unknown } | null)?.member)));
    const fingerprint = JSON.stringify([...recipientsOf(m["to"]), ...recipientsOf(m["cc"])].sort());
    const first = typeof key === "string" ? sentKeys.get(key) : undefined;
    if (first && Date.now() - first.at < 86_400_000) return first.recipients === fingerprint ? send(response, 200, first.answer) : send(response, 409, { error: "key_conflict" });
    // Each recipient's address and, when it is a member's, the member.
    const resolve = (list: unknown): { address: string; member: Member | undefined }[] | null => {
      if (!Array.isArray(list)) return null;
      const out: { address: string; member: Member | undefined }[] = [];
      for (const r of list) {
        if (typeof r === "string") out.push({ address: r, member: chest.members.find(x => x.email !== undefined && x.email.toLowerCase() === r.toLowerCase()) });
        else if (r && typeof r === "object" && typeof (r as { member?: unknown }).member === "string") {
          const who = chest.members.find(x => x.id === (r as { member: string }).member);
          if (!who?.email) return null;
          out.push({ address: who.email, member: who });
        } else return null;
      }
      return out;
    };
    const toAll = resolve(m["to"]), ccAll = resolve(m["cc"] ?? []);
    if (!toAll || !ccAll || toAll.length < 1) return send(response, 400, { error: "invalid_address" });
    if (m["mailbox"] !== undefined && !mailboxes.has(String(m["mailbox"]))) return send(response, 400, { error: "invalid_mailbox" });
    // Proposal (studio.15): the members' email preference, unless the
    // message is transactional.
    const transactional = m["transactional"] === true;
    const held = new Map<string, "none" | "digest">();
    for (const r of [...toAll, ...ccAll]) {
      const preference = r.member?.mailPreference ?? "all";
      if (!transactional && preference !== "all") held.set(r.member!.id, preference);
    }
    const heldBack = (r: { member: Member | undefined }) => r.member !== undefined && held.has(r.member.id);
    const to = toAll.filter(r => !heldBack(r)).map(r => r.address), cc = ccAll.filter(r => !heldBack(r)).map(r => r.address);
    const allowed = [...to, ...cc].filter(a => !suppressed.has(a.toLowerCase()));
    if (allowed.length === 0 && held.size === 0) return send(response, 422, { error: "suppressed" });
    const now = Date.now();
    if (live(mailDay, 86_400_000, now) && mailDay.count >= (mailOptions.perDay ?? 500)) return send(response, 429, { error: "quota_exceeded" }, wait(mailDay, 86_400_000, now));
    count(mailDay, 86_400_000, now, 1);
    const attachments = Array.isArray(m["attachments"]) ? (m["attachments"] as Record<string, unknown>[]).map(a => typeof a["file"] === "string"
      ? { name: String(a["name"] ?? a["file"]), type: files.get(a["file"])?.type ?? "application/octet-stream", size: files.get(a["file"])?.data.byteLength ?? 0 }
      : { name: String(a["name"]), type: String(a["type"]), size: Buffer.from(String(a["content"] ?? ""), "base64").byteLength }) : [];
    const id = newId("msg_");
    if (m["reply_tag"] !== undefined && (typeof m["mailbox"] !== "string" || typeof m["reply_tag"] !== "string" || !/^t[a-z0-9]{1,16}-[a-z2-7]{10}$/u.test(m["reply_tag"]) || m["reply_to"] !== undefined)) return send(response, 400, { error: "invalid_message" });
    const kept: FakeMail = {
      id, messageId: `<${id}@${domain}>`,
      from: typeof m["mailbox"] === "string" ? `${m["mailbox"]}@${domain}` : `no-reply@${domain}`,
      fromName: typeof m["from_name"] === "string" ? m["from_name"] : null,
      to: to.filter(a => allowed.includes(a)), cc: cc.filter(a => allowed.includes(a)),
      subject: String(m["subject"]), text: String(m["text"]),
      ...(typeof m["html"] === "string" ? { html: m["html"] } : {}),
      ...(typeof m["reply_to"] === "string" ? { replyTo: m["reply_to"] } : {}),
      ...(typeof m["reply_tag"] === "string" ? { replyTo: `${m["mailbox"]}+${m["reply_tag"]}@${domain}` } : {}),
      ...(typeof m["in_reply_to"] === "string" ? { inReplyTo: m["in_reply_to"] } : {}),
      ...(Array.isArray(m["references"]) ? { references: m["references"] as string[] } : {}),
      attachments,
      ...(typeof key === "string" ? { key } : {}),
      status: "sent",
    };
    if (allowed.length > 0) chest.outbox.push(kept);
    for (const [member, reason] of held) chest.held.push({ id, member, reason, subject: kept.subject, text: kept.text });
    const answer = { id, message_id: kept.messageId, status: allowed.length > 0 ? "queued" : "held", skipped: [...held].filter(([, r]) => r === "none").map(([id]) => id), digest: [...held].filter(([, r]) => r === "digest").map(([id]) => id) };
    if (typeof key === "string") sentKeys.set(key, { answer, recipients: fingerprint, at: now });
    send(response, 201, answer);
  }

  // The calendar bridge (Proposal (studio)): the tool's events, by key.
  const calendarOptions = options.calendar === false ? null : options.calendar ?? {};
  const calendarDomain = calendarOptions?.domain ?? "chest.test";
  let calendarMinute: Window = { start: 0, count: 0 };
  async function calendarRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (!calendarOptions) return send(response, 404, { error: "not_found" });
    if (!capabilities.has("calendar")) return send(response, 403, { error: "capability_not_granted" });
    const now = Date.now();
    if (request.method === "GET" && url.pathname === "/calendar/events") {
      const q = url.searchParams;
      const limit = q.has("limit") ? Number(q.get("limit")) : 100;
      const after = q.get("after") ?? "";
      if (!Number.isInteger(limit) || limit < 1 || limit > 500 || (after !== "" && !calendarKeyPattern.test(after))) return send(response, 400, { error: "invalid_query" });
      const keys = [...chest.calendar.keys()].filter(k => k > after).sort();
      return send(response, 200, { events: keys.slice(0, limit).map(k => chest.calendar.get(k)), next: keys.length > limit ? keys[limit - 1]! : null });
    }
    // Proposal (studio.15, per event since studio.16): a batch of 1 to 100
    // events, one write of the minute's 600, answered event by event — one
    // the Chest refuses (its reason in the answer) holds none of the others
    // back; a new key beyond the 5,000 events is refused, those before it
    // put.
    if (request.method === "PUT" && url.pathname === "/calendar/events") {
      if (!live(calendarMinute, 60_000, now)) calendarMinute = { start: now, count: 0 };
      if (++calendarMinute.count > calendarLimits.perMinute) return send(response, 429, { error: "rate_limited" }, wait(calendarMinute, 60_000, now));
      const raw = await body(request, 8 << 20);
      if (raw === null) return send(response, 413, { error: "too_large" });
      let given: unknown;
      try { given = (JSON.parse(raw.toString()) as { events?: unknown }).events; } catch { given = undefined; }
      if (!Array.isArray(given) || given.length < 1 || given.length > calendarLimits.perBatch) return send(response, 400, { error: "invalid_event" });
      const keyOf = (e: unknown) => (e !== null && typeof e === "object" && typeof (e as { key?: unknown }).key === "string" ? (e as { key: string }).key : "");
      const times = new Map<string, number>();
      for (const e of given) times.set(keyOf(e), (times.get(keyOf(e)) ?? 0) + 1);
      const results = (given as unknown[]).map(e => {
        const key = keyOf(e);
        if (e === null || typeof e !== "object" || Object.keys(e).some(k => !["key", "members", "title", "description", "location", "path", "busy", "private", "start", "end", "days"].includes(k))) return { key, error: "invalid_event", message: "an event of the calendar" };
        let checked: Record<string, unknown>;
        // The Chest checks what the SDK checked: the same rules.
        try { checked = checkCalendarEvent(e as unknown as CalendarEvent); } catch (error) { return { key, error: (error as { code?: string }).code ?? "invalid_event", message: (error as Error).message }; }
        if ((times.get(key) ?? 0) > 1) return { key, error: "duplicate_key", message: "the key is given more than once" };
        const before = chest.calendar.get(key);
        if (!before && chest.calendar.size >= calendarLimits.events) return { key, error: "quota_exceeded", message: `${calendarLimits.events} events at most` };
        const asked = [...new Set(checked["members"] as string[])];
        const shownTo = asked.filter(access), skipped = asked.filter(id => !access(id));
        const { members: _members, key: _key, ...rest } = checked;
        void _members; void _key;
        chest.calendar.set(key, { ...rest, key, members: shownTo, updated: new Date(now).toISOString(), sequence: before ? before.sequence + 1 : 0 } as FakeCalendarEvent);
        return { key, members: shownTo, skipped };
      });
      return send(response, 200, { results });
    }
    const one = /^\/calendar\/events\/([^/]+)$/u.exec(url.pathname);
    let key: string;
    try { key = decodeURIComponent(one?.[1] ?? ""); } catch { key = ""; }
    if (!one || !calendarKeyPattern.test(key)) return send(response, 400, { error: "invalid_key" });
    if (request.method !== "PUT" && request.method !== "DELETE") return send(response, 404, { error: "not_found" });
    if (!live(calendarMinute, 60_000, now)) calendarMinute = { start: now, count: 0 };
    if (++calendarMinute.count > calendarLimits.perMinute) return send(response, 429, { error: "rate_limited" }, wait(calendarMinute, 60_000, now));
    if (request.method === "DELETE") return chest.calendar.delete(key) ? send(response, 204) : send(response, 404, { error: "event_not_found" });
    const raw = await body(request, 64 << 10);
    if (raw === null) return send(response, 413, { error: "too_large" });
    let e: Record<string, unknown>;
    try { e = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { return send(response, 400, { error: "invalid_event" }); }
    if (e === null || typeof e !== "object" || Object.keys(e).some(k => !["members", "title", "description", "location", "path", "busy", "private", "start", "end", "days"].includes(k))) return send(response, 400, { error: "invalid_event" });
    let checked: Record<string, unknown>;
    // The Chest checks what the SDK checked: the same rules.
    try { checked = checkCalendarEvent({ ...e, key } as unknown as CalendarEvent); } catch (error) { return send(response, 400, { error: (error as { code?: string }).code ?? "invalid_event" }); }
    const before = chest.calendar.get(key);
    if (!before && chest.calendar.size >= calendarLimits.events) return send(response, 429, { error: "quota_exceeded" });
    const asked = [...new Set(checked["members"] as string[])];
    const shownTo = asked.filter(access), skipped = asked.filter(id => !access(id));
    const { members: _members, key: _key, ...rest } = checked;
    void _members; void _key;
    chest.calendar.set(key, { ...rest, key, members: shownTo, updated: new Date(now).toISOString(), sequence: before ? before.sequence + 1 : 0 } as FakeCalendarEvent);
    send(response, before ? 200 : 201, { members: shownTo, skipped });
  }
  // Each member's feed: a secret in its address, kept hashed by a real
  // Chest; here in the clear, by member.
  const feeds = new Map<string, string>();
  const secret = () => randomBytes(32).toString("base64url");
  const feedName = () => `Chest — ${calendarOptions?.company ?? options.chest?.organization ?? "Test organization"}`;
  const writeFeed = (id: string, locale?: string, now?: Date): string => {
    const who = chest.members.find(m => m.id === id);
    const events = who ? [...chest.calendar.values()].filter(e => e.members.includes(id)) : [];
    return calendarFeed(events.map(e => ({ ...e, tool, origin, ...(calendarOptions?.toolTitle ? { toolTitle: calendarOptions.toolTitle } : {}) })), { locale: locale ?? who?.language ?? "en", domain: calendarDomain, name: feedName(), ...(now ? { now } : {}) });
  };

  // Its AI: the declared aliases, the spending this month, the requests this
  // minute.
  const mapped = (options.ai?.models ?? aliasOrder.map((alias): FakeAiModel => ({ alias, model: "fake-" + alias }))).map(m => ({ alias: m.alias, model: m.model, provider: m.provider ?? "openrouter", input: m.input ?? 1, output: m.output ?? 2 }));
  const cap = options.ai?.cap ?? 5;
  const aiMinute: Window = { start: 0, count: 0 };
  let spent = 0;
  const month = () => new Date().toISOString().slice(0, 7);
  const resets = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().replace(".000Z", "Z");
  };
  const spend = (m: { input: number; output: number }, input: number, output: number): number => {
    const cost = Math.round((input * m.input + output * m.output) / 1e6 * 1e6) / 1e6;
    spent = Math.round((spent + cost) * 1e6) / 1e6;
    return cost;
  };
  // echo is the text of the last user message: its text, or its text parts.
  const echo = (request: Record<string, unknown>): string => {
    const last = [...request["messages"] as { role?: unknown; content?: unknown }[]].reverse().find(m => m?.role === "user")?.content;
    return typeof last === "string" ? last : Array.isArray(last) ? last.map(p => (p as { text?: unknown })?.text).filter(t => typeof t === "string").join("") : "";
  };

  async function aiRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const raw = request.method === "POST" ? await body(request, maxAiBody) : null;
    let command: Record<string, unknown> | null = null;
    try {
      const value = JSON.parse(raw?.toString() ?? "") as unknown;
      if (value !== null && typeof value === "object" && !Array.isArray(value)) command = value as Record<string, unknown>;
    } catch {
      command = null;
    }
    chest.ai.push({ path: url.pathname, body: command });
    if (!capabilities.has("ai")) return send(response, 403, { error: "capability_not_granted" });
    if (request.method === "GET" && url.pathname === "/ai/models") return send(response, 200, { models: [...mapped].sort((a, b) => aliasOrder.indexOf(a.alias) - aliasOrder.indexOf(b.alias)) });
    if (request.method === "GET" && url.pathname === "/ai/usage") return send(response, 200, { month: month(), spent, cap, resets: resets() });
    if (request.method !== "POST" || (url.pathname !== "/ai/chat" && url.pathname !== "/ai/embeddings")) return send(response, 404, { error: "not_found" });
    if (raw === null) return send(response, 413, { error: "too_large" });
    const chat = url.pathname === "/ai/chat";
    if (!command || !Object.keys(command).every(k => chat ? chatKeys.includes(k) : ["model", "input", "dimensions", "member"].includes(k))) return send(response, 400, { error: "invalid_body" });
    const model = mapped.find(m => m.alias === command!["model"]);
    if (!model) return send(response, 403, { error: "model_not_allowed" });
    const member = command["member"];
    if (member !== undefined && (typeof member !== "string" || !memberIdPattern.test(member))) return send(response, 400, { error: "invalid_body" });
    const now = Date.now();
    // refused says the refusal of a valid request, if any: the rate, the
    // provider, the cap.
    const refused = (): boolean => {
      const busy = live(aiMinute, 60_000, now) && aiMinute.count >= aiPerMinute;
      if (busy) send(response, 429, { error: "rate_limited" }, wait(aiMinute, 60_000, now));
      else {
        count(aiMinute, 60_000, now, 1);
        if (options.ai?.unavailable) send(response, options.ai.unavailable === "provider_key_invalid" ? 502 : 503, { error: options.ai.unavailable });
        else if (spent >= cap) send(response, 402, { error: "cap_reached", scope: "tool", resets: resets() });
      }
      return response.headersSent;
    };
    if (!chat) {
      const input = command["input"], texts = typeof input === "string" ? [input] : input, dimensions = command["dimensions"] ?? fakeDimensions;
      if (!Array.isArray(texts) || texts.length < 1 || texts.length > maxInputs || !texts.every(t => typeof t === "string") || typeof dimensions !== "number" || !Number.isInteger(dimensions) || dimensions < 1 || dimensions > 4096) return send(response, 400, { error: "invalid_body" });
      if (refused()) return;
      const used = texts.reduce((sum: number, t: string) => sum + tokensOf(t), 0);
      const cost = spend(model, used, 0);
      return send(response, 200, { object: "list", data: texts.map((t: string, index) => ({ object: "embedding", index, embedding: vectorOf(t, dimensions) })), model: model.model, usage: { prompt_tokens: used, total_tokens: used, cost } });
    }
    const messages = command["messages"], limit = command["max_tokens"] ?? 4096;
    if (!Array.isArray(messages) || messages.length < 1 || !messages.every(m => m !== null && typeof m === "object" && typeof (m as { role?: unknown }).role === "string") || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > maxAiOutput || !(command["stream"] === undefined || typeof command["stream"] === "boolean")) return send(response, 400, { error: "invalid_body" });
    if (refused()) return;
    const given = options.ai?.reply ? options.ai.reply(command) : echo(command);
    const text = typeof given === "string" ? given : given.text ?? "";
    const calls = (typeof given === "string" ? [] : given.toolCalls ?? []).map((c, i) => ({ id: c.id ?? `call_${i + 1}`, type: "function" as const, function: { name: c.name, arguments: c.arguments } }));
    const input = tokensOf(JSON.stringify(messages)), output = tokensOf(text + calls.map(c => c.function.name + c.function.arguments).join(""));
    const usage = { prompt_tokens: input, completion_tokens: output, total_tokens: input + output, prompt_tokens_details: { cached_tokens: 0 }, cost: spend(model, input, output) };
    const finish = calls.length ? "tool_calls" : "stop";
    const head = { id: "chatcmpl-fake", created: Math.floor(now / 1000), model: model.model };
    if (command["stream"] !== true) {
      return send(response, 200, { ...head, object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: calls.length && !text ? null : text, ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: finish }], usage });
    }
    // Streamed: the role, the text word by word, each call's name then its
    // arguments in two halves, the finish reason, the usage, [DONE].
    const chunk = (choices: unknown[], extra: Record<string, unknown> = {}) => `data: ${JSON.stringify({ ...head, object: "chat.completion.chunk", choices, ...extra })}\n\n`;
    const delta = (d: Record<string, unknown>, finishReason: string | null = null) => chunk([{ index: 0, delta: d, finish_reason: finishReason }]);
    const parts = [delta({ role: "assistant", content: "" })];
    for (const word of text.match(/\S+\s*|\s+/gu) ?? []) parts.push(delta({ content: word }));
    calls.forEach((c, index) => {
      const half = Math.ceil(c.function.arguments.length / 2);
      parts.push(delta({ tool_calls: [{ index, id: c.id, type: "function", function: { name: c.function.name, arguments: "" } }] }));
      for (const piece of [c.function.arguments.slice(0, half), c.function.arguments.slice(half)]) if (piece) parts.push(delta({ tool_calls: [{ index, function: { arguments: piece } }] }));
    });
    parts.push(delta({}, finish), chunk([], { usage }), "data: [DONE]\n\n");
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    for (const part of parts) response.write(part);
    response.end();
  }

  // The acknowledgment of an erasure the tool was told of (emit).
  async function erasuresRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (!receives.includes("member.*")) return send(response, 403, { error: "capability_not_granted" });
    const done = /^\/erasures\/([^/]+)\/done$/u.exec(url.pathname);
    if (request.method !== "POST" || !done || url.search) return send(response, 404, { error: "not_found" });
    const id = done[1]!;
    if (!/^era_[a-z2-7]{26}$/u.test(id)) return send(response, 400, { error: "invalid_id" });
    if (!erasures.has(id)) return send(response, 404, { error: "erasure_not_found" });
    if (!chest.acknowledged.includes(id)) chest.acknowledged.push(id);
    send(response, 204);
  }

  // Proposal (studio): the look of this tool — its override, or the
  // company's choice for all tools, or nothing (its own identity) — never
  // kept by the tool (max-age=0), so a harness's switch shows at once.
  async function themeRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (request.method !== "GET" || url.search) return send(response, 404, { error: "not_found" });
    const own = chest.theme.tools[tool];
    const chosen = own ?? chest.theme.all;
    const scope = own ? "tool" : chest.theme.all ? "chest" : "default";
    send(response, 200, { ...(chosen ?? { mode: "own" }), scope }, { "Cache-Control": "max-age=0" });
  }

  // The team host's own routes, which a Chest's front serves beside the
  // tool: the upload a member's browser sends, the signed links, the members'
  // photos. A harness relays /_chest/ of its host here (origin).
  async function frontRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const upload = /^\/_chest\/(files\/)?upload\/([A-Za-z0-9_-]+\.up)$/u.exec(url.pathname);
    if (upload && request.method === "PUT") {
      const token = upload[2]!, grant = uploads.get(token);
      uploads.delete(token);
      // A private token on the team host's route, a public one on the public
      // host's: never the other way round.
      if (!grant || grant.expires < Date.now() || grant.public !== (upload[1] === undefined)) return send(response, 403, { error: "invalid_token" });
      const type = (request.headers["content-type"] ?? "application/octet-stream").split(";")[0]!.trim().toLowerCase();
      if (grant.types.length > 0 && !grant.types.some(t => t === type || (t.endsWith("/*") && type.startsWith(t.slice(0, -1))))) return send(response, 415, { error: "type_refused" });
      const data = await body(request, grant.maxSize);
      if (data === null) return send(response, 413, { error: "too_large" });
      const total = [...files.values()].reduce((sum, f) => sum + f.data.byteLength, 0);
      if (total + data.length > maxTotal || files.size >= maxObjects) return send(response, 429, { error: "quota_exceeded" });
      const extension = (type.split("/")[1] ?? "bin").replace(/[^a-z0-9]/gu, "").slice(0, 8) || "bin";
      const name = grant.name.endsWith("/") ? grant.name + randomBytes(10).toString("hex") + "." + (extension === "jpeg" ? "jpg" : extension) : grant.name;
      const kept = { data: new Uint8Array(data), type, updated: new Date().toISOString() };
      files.set(name, kept);
      if (!grant.public) return send(response, 201, { name, type, size: data.length });
      // A visitor's upload: what they hand to the tool's form is a claim, not
      // the name — only the one who uploaded holds it.
      const claim = randomBytes(24).toString("base64url") + ".claim";
      claims.set(claim, { name, deleteAt: grant.unclaimed === undefined ? null : Date.now() + grant.unclaimed * 1000 });
      return send(response, 201, { type, size: data.length, claim });
    }
    const link = /^\/_chest\/files\/([A-Za-z0-9_-]+)\.fake$/u.exec(url.pathname);
    if (link && request.method === "GET") {
      const object = files.get(Buffer.from(link[1]!, "base64url").toString());
      if (!object) return send(response, 404, { error: "not_found" });
      return void response.writeHead(200, { "Content-Type": object.type, "Content-Length": String(object.data.byteLength), "Cache-Control": "private, max-age=900" }).end(object.data);
    }
    const shared = /^\/_chest\/public\/(.+)$/u.exec(url.pathname);
    if (shared && request.method === "GET") {
      const object = storage.publicFiles ? files.get("public/" + decodeURIComponent(shared[1]!)) : undefined;
      if (!object) return send(response, 404, { error: "not_found" });
      return void response.writeHead(200, { "Content-Type": object.type, "Content-Length": String(object.data.byteLength), "Cache-Control": "public, max-age=3600" }).end(object.data);
    }
    // Proposal (studio): the look's files (fonts, logo), public on both hosts.
    const look = /^\/_chest\/theme\/([A-Za-z0-9._~\-/]+)$/u.exec(url.pathname);
    if (look && request.method === "GET") {
      const file = look[1]!.includes("..") ? undefined : chest.themeFiles.get(look[1]!);
      if (!file) return send(response, 404, { error: "not_found" });
      return void response.writeHead(200, { "Content-Type": file.type, "Content-Length": String(file.data.byteLength), "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" }).end(file.data);
    }
    // Proposal (studio): a member's calendar feed, and the page where they
    // find its address ("Add your Chest calendar") — shown to the member
    // the front signs in (a harness adds the assertion, as on /chest).
    const ics = /^\/_chest\/calendar\/([A-Za-z0-9_-]{43})\.ics$/u.exec(url.pathname);
    if (ics && (request.method === "GET" || request.method === "HEAD")) {
      const owner = [...feeds].find(([, t]) => t === ics[1])?.[0];
      if (!owner || !calendarOptions || !chest.members.some(m => m.id === owner)) return send(response, 404, { error: "not_found" });
      const text = writeFeed(owner);
      const etag = '"' + createHash("sha256").update(text).digest("base64url").slice(0, 22) + '"';
      const headers = { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "ETag": etag, "Content-Disposition": 'inline; filename="chest.ics"', "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
      if (request.headers["if-none-match"] === etag) return void response.writeHead(304, headers).end();
      return void response.writeHead(200, { ...headers, "Content-Length": String(Buffer.byteLength(text)) }).end(request.method === "HEAD" ? undefined : text);
    }
    if ((url.pathname === "/_chest/calendar" && request.method === "GET") || (url.pathname === "/_chest/calendar/new" && request.method === "POST")) {
      const who = memberOf(request);
      if (!who || !calendarOptions) return send(response, 404, { error: "not_found" });
      if (url.pathname === "/_chest/calendar/new") {
        chest.newFeedUrl(who.id);
        return void response.writeHead(303, { Location: "/_chest/calendar" }).end();
      }
      const address = chest.feedUrl(who.id);
      const fr = who.language === "fr";
      const esc = (v: string) => v.replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
      const html = `<!doctype html><html lang="${fr ? "fr" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${fr ? "Votre calendrier Chest" : "Your Chest calendar"}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#1b1f24;background:#fff}input{width:100%;font:inherit;padding:.5rem;border:1px solid #8a9199;border-radius:6px}button,a.b{font:inherit;padding:.5rem 1rem;border-radius:6px;border:1px solid #1b1f24;background:#fff;color:#1b1f24;text-decoration:none;display:inline-block;margin:.5rem .5rem 0 0}@media (prefers-color-scheme:dark){body{background:#15181c;color:#e8ebee}button,a.b{background:#15181c;color:#e8ebee;border-color:#e8ebee}input{background:#0e1013;color:inherit}}</style></head><body><h1>${fr ? "Ajoutez votre calendrier Chest" : "Add your Chest calendar"}</h1><p>${fr ? "Vos réservations, absences et rendez-vous de tous les outils, dans l'agenda que vous utilisez déjà. Copiez l'adresse et ajoutez-la une fois." : "Your bookings, time off and meetings from every tool, in the calendar you already use. Copy the address and add it once."}</p><label for="feed">${fr ? "Adresse de votre calendrier (secrète)" : "Your calendar's address (keep it secret)"}</label><input id="feed" readonly value="${esc(address)}"><p><a class="b" href="${esc(address.replace(/^https?:/u, "webcal:"))}">${fr ? "Ouvrir dans Apple Calendar ou Outlook" : "Open in Apple Calendar or Outlook"}</a></p><p>${fr ? "Google Agenda : Autres agendas › + › À partir de l'URL, puis collez l'adresse. Google l'actualise à son rythme (souvent quelques heures)." : "Google Calendar: Other calendars › + › From URL, then paste the address. Google refreshes it at its own pace (often a few hours)."}</p><form method="post" action="/_chest/calendar/new"><p>${fr ? "Quelqu'un d'autre a l'adresse ? Remplacez-la : l'ancienne cesse de fonctionner." : "Someone else has the address? Replace it: the old one stops working."}</p><button>${fr ? "Nouvelle adresse" : "New address"}</button></form></body></html>`;
      return void response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": String(Buffer.byteLength(html)), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }).end(html);
    }
    const photo = /^\/_chest\/members\/(mbr_[a-z2-7]{26})\/photo$/u.exec(url.pathname);
    if (photo && request.method === "GET") {
      const m = chest.members.find(x => x.id === photo[1]);
      if (!m) return send(response, 404, { error: "not_found" });
      // A drawn picture: the initials on a colour of the identifier.
      const initials = ((m.firstName[0] ?? "") + (m.lastName[0] ?? "") || m.name.slice(0, 1)).toUpperCase().replace(/[<>&"']/gu, "");
      const hue = [...m.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 45% 42%)"/><text x="32" y="41" font-family="sans-serif" font-size="24" font-weight="600" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
      return void response.writeHead(200, { "Content-Type": "image/svg+xml", "Content-Length": String(Buffer.byteLength(svg)) }).end(svg);
    }
    send(response, 404, { error: "not_found" });
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const route = url.pathname.startsWith("/_chest/") ? frontRoute
      : url.pathname.startsWith("/erasures/") ? erasuresRoute
      : url.pathname.startsWith("/ai/") ? aiRoute
      : url.pathname.startsWith("/mail/") ? mailRoute
      : url.pathname === "/calendar/events" || url.pathname.startsWith("/calendar/events/") ? calendarRoute
      : url.pathname === "/events" || url.pathname === "/events/receivers" ? eventsRoute
      : url.pathname === "/theme" ? themeRoute
      : url.pathname === "/visitors/count" ? visitorsRoute
      : url.pathname === "/checks" ? checksRoute
      : url.pathname === "/webhooks" || url.pathname.startsWith("/webhooks/") ? webhooksRoute
      : url.pathname === "/members" || url.pathname.startsWith("/members/") || url.pathname === "/groups" || url.pathname.startsWith("/groups/") ? members
      : url.pathname === "/files" || url.pathname.startsWith("/files/") ? filesRoute
      : url.pathname === "/badges" || url.pathname.startsWith("/badges/") || url.pathname.startsWith("/notifications") ? notificationsRoute : null;
    if (!route) return send(response, 404, { error: "not_found" });
    route(request, response, url).catch(() => { if (!response.headersSent) send(response, 503, { error: "unavailable" }); else response.destroy(); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const saved = Object.fromEntries(["CHEST_API", "CHEST_TOKEN", "CHEST_TOOL", "CHEST_ORGANIZATION", "CHEST_TIME_ZONE", "CHEST_LANGUAGE", "CHEST_CURRENCY", "CHEST_TEAM_URL", "CHEST_PUBLIC_URL", "CHEST_TOOL_URLS"].map(name => [name, process.env[name]]));
  chest.api = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  const zone = chestZone;
  Object.assign(process.env, { CHEST_API: chest.api, CHEST_TOKEN: token, CHEST_TOOL: tool, CHEST_ORGANIZATION: options.chest?.organization ?? "Test organization", CHEST_TIME_ZONE: zone, CHEST_LANGUAGE: chestLanguage, CHEST_TEAM_URL: origin });
  const settings = { currency: options.chest?.currency, publicUrl: options.chest?.publicUrl };
  for (const [name, value] of [["CHEST_CURRENCY", settings.currency], ["CHEST_PUBLIC_URL", settings.publicUrl]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  // The tools installed beside this one (chest.toolUrl): written to the
  // environment as the Chest writes CHEST_TOOL_URLS, this tool first.
  const writeTools = () => {
    process.env["CHEST_TOOL_URLS"] = JSON.stringify(chest.tools);
  };
  const addresses = (name: string, given: FakeToolAddresses | true | undefined) => {
    if (!toolNamePattern.test(name) || name.length > 63) throw new Error(`fakeChest: ${JSON.stringify(name)} is not a tool's name (chest.json "name")`);
    const value = given === true || given === undefined ? {} : given;
    return { team: value.team === undefined ? `https://${name}-chest.chest.test` : value.team, public: value.public ?? null };
  };
  chest.tools = { [tool]: { team: origin, public: settings.publicUrl ?? null } };
  for (const [name, given] of Object.entries(options.tools ?? {})) if (name !== tool) chest.tools[name] = addresses(name, given);
  chest.installTool = (name, given) => {
    if (name === tool) throw new Error("fakeChest.installTool: this tool is already installed (its addresses are the fake's origin and chest.publicUrl)");
    chest.tools[name] = addresses(name, given);
    writeTools();
  };
  chest.removeTool = name => {
    if (name === tool) throw new Error("fakeChest.removeTool: not this tool itself");
    delete chest.tools[name];
    writeTools();
  };
  writeTools();
  forget();
  forgetTheme();
  chest.clearCaches = () => {
    forget();
    forgetTheme();
  };
  // The declared network (studio.15): the tool's fetch() as through the
  // Chest's egress proxy, while the fake runs.
  const unpatch = options.network ? routeNetwork(options.network, chest.egress) : () => {};
  chest.emit = async (event, to) => {
    const id = event.id ?? "evt_" + Array.from(randomBytes(26), b => "abcdefghijklmnopqrstuvwxyz234567"[b & 31]).join("");
    const body = JSON.stringify({ id, type: event.type, occurredAt: event.occurredAt ?? new Date().toISOString(), data: event.data });
    if (event.type === "member.erased") erasures.add(event.data.erasure);
    const request = new Request(typeof to === "string" ? to.replace(/\/$/u, "") + "/chest-events" : "http://tool.test/chest-events", { method: "POST", headers: { "Content-Type": "application/json", "Chest-Event": signEvent(id, body, { token, tool }) }, body });
    const answer = typeof to === "string" ? await fetch(request, { redirect: "manual" }) : await to(request);
    await answer.body?.cancel();
    return answer.status;
  };
  // run delivers a run of a declared schedule to POST /chest-jobs/<name>,
  // signed as the Chest signs it (Chest-Job), and says the status answered.
  chest.run = async (name, to, runOptions = {}) => {
    if (!chest.schedules.some(s => s.name === name)) throw new Error(`fakeChest: no schedule named ${name} (options.schedules)`);
    const id = runOptions.id ?? "run_" + Array.from(randomBytes(26), b => "abcdefghijklmnopqrstuvwxyz234567"[b & 31]).join("");
    const scheduledAt = runOptions.scheduledAt ?? new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
    const attempt = runOptions.attempt ?? 1;
    const body = JSON.stringify({ id, name, scheduledAt, attempt, timeZone: zone });
    const request = new Request((typeof to === "string" ? to.replace(/\/$/u, "") : "http://tool.test") + "/chest-jobs/" + name, { method: "POST", headers: { "Content-Type": "application/json", "Chest-Job": signEvent(id, body, { token, tool, label: "Chest-Job v1" }) }, body });
    const answer = typeof to === "string" ? await fetch(request, { redirect: "manual" }) : await to(request);
    await answer.body?.cancel();
    chest.runs.push({ id, name, scheduledAt, attempt, status: answer.status });
    return answer.status;
  };
  chest.check = async (name, to, given = {}) => {
    if (!chest.checks.some(c => c.name === name)) throw new Error(`fakeChest: no check named ${name} (the tool has not configured it)`);
    const id = given.id ?? newId("chk_");
    const ok = given.ok ?? true;
    const body = JSON.stringify({ id, name, at: given.at ?? new Date().toISOString(), ok, status: given.status === undefined ? (ok ? 200 : 503) : given.status, ms: given.ms ?? 120, error: given.error === undefined ? (ok ? null : "status") : given.error });
    const request = new Request((typeof to === "string" ? to.replace(/\/$/u, "") : "http://tool.test") + "/chest-checks", { method: "POST", headers: { "Content-Type": "application/json", "Chest-Check": signEvent(id, body, { token, tool, label: "Chest-Check v1" }) }, body });
    const answer = typeof to === "string" ? await fetch(request, { redirect: "manual" }) : await to(request);
    await answer.body?.cancel();
    return answer.status;
  };
  // deliver hands the tool an event of another tool (its source is the part
  // of the type before the first dot), signed as the Chest signs events.
  chest.deliver = async (event, to) => {
    const id = event.id ?? newId("evt_");
    const source = event.source ?? event.type.split(".")[0]!;
    const body = JSON.stringify({ id, type: event.type, source, occurredAt: event.occurredAt ?? new Date().toISOString(), data: event.data });
    const request = new Request((typeof to === "string" ? to.replace(/\/$/u, "") : "http://tool.test") + "/chest-events", { method: "POST", headers: { "Content-Type": "application/json", "Chest-Event": signEvent(id, body, { token, tool }) }, body });
    const answer = typeof to === "string" ? await fetch(request, { redirect: "manual" }) : await to(request);
    await answer.body?.cancel();
    return answer.status;
  };
  // receive delivers a message to one of the tool's mailboxes: its
  // attachments stored in the tool's files first (mail/…), then POST
  // /chest-mail, signed as the Chest signs it (Chest-Mail).
  chest.receive = async (message, to) => {
    const id = message.id ?? newId("rcv_");
    const kept: { file: string; name: string; type: string; size: number }[] = [];
    const dropped: { name: string; size: number; reason: string }[] = [];
    for (const a of message.attachments ?? []) {
      const data = typeof a.content === "string" ? new TextEncoder().encode(a.content) : a.content;
      // As the Chest: 20 attachments at most, no executable.
      if (kept.length >= 20) { dropped.push({ name: a.name, size: data.byteLength, reason: "count" }); continue; }
      if (/\.(exe|bat|cmd|com|scr|js|vbs|msi|jar|ps1)$/iu.test(a.name) || a.type === "application/x-msdownload") { dropped.push({ name: a.name, size: data.byteLength, reason: "type" }); continue; }
      const extension = (a.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/gu, "").slice(0, 8) || "bin";
      const file = `mail/${randomBytes(10).toString("hex")}.${extension}`;
      files.set(file, { data, type: a.type, updated: new Date().toISOString() });
      kept.push({ file, name: a.name, type: a.type, size: data.byteLength });
    }
    const address = `${message.mailbox}@${domain}`;
    const deliveredTo = message.deliveredTo ?? (message.thread !== undefined ? `${message.mailbox}+${threadTag(message.mailbox, message.thread)}@${domain}` : address);
    const messageId = `<${id}@sender.test>`;
    // The original, as a mail server would have kept it (enough for "Show
    // original"; a real Chest keeps the bytes it received).
    const original = `mail/${randomBytes(10).toString("hex")}.eml`;
    const headerLine = (s: string) => s.replace(/[\r\n]+/gu, " ");
    const eml = [`From: ${message.fromName ? `"${headerLine(message.fromName).replace(/"/gu, "")}" ` : ""}<${message.from}>`, `To: ${(message.to ?? [address]).join(", ")}`, `Subject: ${headerLine(message.subject)}`, `Message-ID: ${messageId}`, ...(message.inReplyTo ? [`In-Reply-To: ${message.inReplyTo}`] : []), `Date: ${new Date().toUTCString()}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", message.text].join("\r\n");
    files.set(original, { data: new TextEncoder().encode(eml), type: "message/rfc822", updated: new Date().toISOString() });
    const body = JSON.stringify({
      kind: "message", id, mailbox: message.mailbox, from: { address: message.from, name: message.fromName ?? null }, to: message.to ?? [address], cc: message.cc ?? [], delivered_to: deliveredTo,
      subject: message.subject, text: message.text, html: message.html === undefined ? null : cleanHtml(message.html), original, message_id: messageId, in_reply_to: message.inReplyTo ?? null, references: message.references ?? [],
      attachments: kept, dropped, received_at: new Date().toISOString(), spam: message.spam ?? 0, authenticated: message.authenticated ?? true, auto: message.auto ?? false,
    });
    const request = new Request((typeof to === "string" ? to.replace(/\/$/u, "") : "http://tool.test") + "/chest-mail", { method: "POST", headers: { "Content-Type": "application/json", "Chest-Mail": signEvent(id, body, { token, tool, label: "Chest-Mail v1" }) }, body });
    const answer = typeof to === "string" ? await fetch(request, { redirect: "manual" }) : await to(request);
    await answer.body?.cancel();
    return answer.status;
  };
  chest.bounce = async (messageId, to, given = {}) => {
    const sent = chest.outbox.find(m => m.id === messageId);
    if (!sent) throw new Error(`fakeChest: no message ${messageId} in the outbox`);
    const recipient = given.recipient ?? sent.to[0]!;
    const permanent = given.permanent ?? true;
    sent.status = "bounced";
    if (permanent) suppressed.add(recipient.toLowerCase());
    const id = given.id ?? newId("bnc_");
    const body = JSON.stringify({ kind: "bounce", id, message: messageId, recipient, permanent, reason: given.reason ?? (permanent ? "550 5.1.1 The email account that you tried to reach does not exist" : "452 4.2.2 Mailbox full"), at: new Date().toISOString() });
    const request = new Request((typeof to === "string" ? to.replace(/\/$/u, "") : "http://tool.test") + "/chest-mail", { method: "POST", headers: { "Content-Type": "application/json", "Chest-Mail": signEvent(id, body, { token, tool, label: "Chest-Mail v1" }) }, body });
    const answer = typeof to === "string" ? await fetch(request, { redirect: "manual" }) : await to(request);
    await answer.body?.cancel();
    return answer.status;
  };
  // The calendar's inspection (Proposal (studio)).
  chest.feedUrl = id => {
    if (!memberIdPattern.test(id)) throw new Error("fakeChest.feedUrl: a member id");
    if (!feeds.has(id)) feeds.set(id, secret());
    return `${origin}/_chest/calendar/${feeds.get(id)}.ics`;
  };
  chest.newFeedUrl = id => {
    feeds.set(id, secret());
    return chest.feedUrl(id);
  };
  chest.feed = (id, given = {}) => writeFeed(id, given.locale, given.now);
  // upload plays a member's browser sending a file to an uploadUrl answer.
  chest.upload = async (link, data, type) => {
    const path = new URL(link).pathname;
    return fetch(chest.api + path, { method: "PUT", body: typeof data === "string" ? data : new Uint8Array(data), headers: { "Content-Type": type } });
  };
  chest.close = async () => {
    unpatch();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    forget();
    forgetTheme();
  };
  return chest;
}
