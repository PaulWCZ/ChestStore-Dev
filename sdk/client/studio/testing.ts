import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { connect as connectSocket, isIP, type AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { member as memberOf, memberIdPattern, type Member } from "../src/member.js";
import { forget } from "../src/members.js";
import { matchLimits } from "./members.js";
import { sign, type Channel } from "../src/signed.js";
import { fakeChest as officialFakeChest, signAssertion as officialSignAssertion, withMember as officialWithMember, type AssertionOptions, type FakeChest as OfficialFakeChest, type FakeChestOptions as OfficialFakeChestOptions, type FakeFormer as OfficialFakeFormer } from "../src/testing.js";
import { check as checkCalendarEvent, feed as calendarFeed, keyPattern as calendarKeyPattern, limits as calendarLimits, type CalendarEvent, type KeptEvent } from "./calendar-rules.js";
import { forgetTheme, toolNamePattern } from "./chest.js";
import { isAddress } from "./mail.js";
import { checkChannel, webhooksChannel } from "./signed.js";
import { checkInput as checkWebhookInput, checkMessage as checkWebhookMessage, deliveryIdPattern as webhookDeliveryPattern, format as formatWebhook, isPublicAddress, keyPattern as wireKeyPattern, limits as webhookLimits, shownUrl, sign as signWebhook, targetIdPattern as webhookTargetPattern, type WebhookDelivery, type WebhookKind, type WebhookTarget } from "./webhooks-rules.js";

// @argentic/chest-sdk/testing as the studio publishes it (0.7.0-studio.N):
// 0.7.0's fake Chest, unchanged, with the fakes of the studio's proposals
// layered on it.
//
// How the layers sit. fakeChest() starts 0.7.0's fakeChest — its members,
// groups (with "members.groups" and groups that do not give the tool),
// files (links, a member's and a visitor's uploads on its own origin),
// folders of Files, badges, notifications (translations, broadcast, the
// pace), AI, erasures, emits and deliveries of events between tools,
// sealed values, realtime, schedules' runs and actions' calls, with its
// bounds and errors — then a second server on 127.0.0.1, the studio's,
// which CHEST_API points to. The studio's server answers the routes of the
// proposals itself (mail, calendar, theme, visitors, checks, webhooks,
// matchEmails, leftAt, public files, members' photos) and passes every
// other request to 0.7.0's server as it came — a page's realtime connection
// (an HTTP upgrade) included — its answer back as it went, so a call the
// official SDK makes meets the official fake. One answer only is completed
// on the way back: lookup answers as former the people a test put in
// chest.former after the start (0.7.0 reads options.former once). The
// fake's address (api, CHEST_API) is the studio's server, and 0.7.0's links,
// uploads and realtime addresses are written for it.
//
//   import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
//   const chest = await fakeChest({ tool: "booking", members: [camille], capabilities: ["members", "notifications", "mail"], mail: { replyTo: "contact@atelier.test" } });
//   await app(withMember(new Request("http://tool/chest"), camille));
//   assert.equal(chest.outbox[0]?.subject, "Your booking on 3 November");     // mail to someone outside (studio)
//   assert.equal(chest.notifications[0]?.title, "Nouvelle réservation");    // 0.7.0's: in the member's language
//   assert.equal(await chest.run("morning", request => app(request)), 204);   // 0.7.0's
//   await chest.close();
//
// What 0.7.0 now gives, the studio's fake dropped (0.4.1-studio.7 →
// 0.7.0-studio.1): its groups (grants, "members.groups", groups.all), its
// notify and broadcast with translations (FakeNotification.translations,
// shownTo: 0.7.0 keeps each item in the member's language), its events
// between tools (options emits as a list, receivers, linked; published,
// linked, deliver: 0.7.0's emits {type: {description, data}}, emitted,
// deliver({type, source, audience, subject, data})), its group events
// (group.changed, group.removed: 0.7.0 has none), its public uploads
// (publicUploadUrl, claim, publicApi, storage.publicUploads: 0.7.0's
// uploadUrl(folder, {public: true})), and the Chest's currency (0.7.0 has
// none: options chest.currency and CHEST_CURRENCY are gone).

// A member as a test names them: a Member whose language and time zone may
// be left out — the fake Chest then gives the Chest's own (options.chest:
// "en" and "UTC" unless said), as a real Chest gives a member its default
// language and, until their browser said its zone, the Chest's zone. A
// value given is signed as given: one the Chest never sends makes member()
// refuse it.
export type FakeMember = Omit<Member, "language" | "timeZone"> & { language?: string; timeZone?: string };
// A member as the fake Chest keeps them (chest.members).
export type StudioMember = Member;
// Someone the tool had who no longer has it: 0.7.0's, and when they left
// the Chest (members.leftAt), for "former" and "erased".
export type FakeFormer = OfficialFakeFormer & { leftAt?: string };
// What answers a request the tool's fetch() made to a declared host.
export type FakeNetworkHandler = (request: Request) => Response | Promise<Response>;
// A request the tool's fetch() made to the outside while the fake ran:
// answered by a handler (status), or refused as the Chest's egress proxy
// refuses (reason: undeclared, ip-literal, port).
export type FakeEgress = { method: string; url: string; status: number | null; refused?: "undeclared" | "ip-literal" | "port" };
// Whether the fake Chest delivers mail (the owner connected the company's
// mail provider; the Chest has not paused it) and webhooks (not paused by
// the owner).
export type FakeDelivery = { mail: "ready" | "not_connected" | "suspended"; webhooks: "ready" | "suspended" };
// A tool installed beside this one, as a test names it: its team origin
// (https://<name>-chest.chest.test when left out) and its public origin
// while its public part is open.
export type FakeToolAddresses = { teamUrl?: string; publicUrl?: string | null };
// How a webhook target answers the fake Chest: an HTTP status, or a
// network failure.
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
  // The time of every pending retry comes: each delivery "retrying" — and
  // each one the pace held back ("pending") — is attempted once more. Says
  // how many were attempted.
  retry(): Promise<number>;
};
// A choice as a test names it: what theme() answers, without its scope
// (the fake Chest says which level it came from).
export type FakeThemeChoice = { mode: "own" } | { mode: "catalogue"; theme: string; fonts?: string; faces?: unknown[] } | { mode: "brand"; brand: Record<string, unknown>; fonts?: string } | Record<string, unknown>;
// The company's two levels: its choice for all tools, and its overrides.
export type FakeTheme = { all?: FakeThemeChoice | null; tools?: Record<string, FakeThemeChoice | null> };
// A message the tool sent to people outside, as the fake Chest's outbox
// keeps it: replyTo is the Reply-To it went with — the tool's, or the
// company's reply address (mail.replyTo) — absent when there was none.
// "queued": beyond the pace, until sendAt (then "sent").
export type FakeMail = { id: string; messageId: string; from: string; fromName: string | null; to: string[]; cc: string[]; subject: string; text: string; html?: string; replyTo?: string; attachments: { name: string; type: string; size: number }[]; key?: string; status: "queued" | "sent" | "bounced" | "complained"; sendAt?: string };
// An event of the calendar as the fake Chest keeps it.
export type FakeCalendarEvent = KeptEvent;
type Target = string | ((request: Request) => Response | Promise<Response>);

// What a fake Chest is given: 0.7.0's options — members (FakeMember here),
// former (FakeFormer here), groups, capabilities ("mail" and "calendar"
// too), roles, receives, emits, files, folders, ai, realtime, chest — and
// the options of the studio's proposals.
export type FakeChestOptions = Omit<OfficialFakeChestOptions, "members" | "former"> & {
  // The tool's name (chest.json "name"), set as CHEST_TOOL while the fake
  // runs — what member() and the signatures read. The environment's
  // CHEST_TOOL, or "tool", when left out (0.7.0's rule).
  tool?: string;
  members?: FakeMember[];
  former?: FakeFormer[];
  // The other tools installed on this Chest, by name (chest.tools,
  // CHEST_TOOL_URLS): true for a team host at
  // https://<name>-chest.chest.test, or its addresses. This tool is always
  // there, at chest: {teamUrl, publicUrl}.
  tools?: Record<string, FakeToolAddresses | true>;
  // The Chest's ceiling per visitor's address across the tools, an hour
  // (visitors.count).
  visitors?: { perAddressHour?: number };
  // Checks run by the Chest ("checks": true; a studio.1 {max} bounds
  // nothing).
  checks?: true | { max?: number };
  // Whether the Chest delivers mail and webhooks (mail.available,
  // webhooks.available): "ready" by default; also chest.delivery.
  delivery?: Partial<FakeDelivery>;
  // The storage spec's public files (chest.proposals.json "files":
  // {"publicFiles": true}): objects under public/ served on the front's
  // /_chest/public/.
  storage?: { publicFiles?: boolean };
  // Mail to people outside (with "mail" in capabilities). connected: false
  // is a Chest whose owner has not connected the company's mail provider
  // (available() says "not_connected", send throws Unavailable) — the same
  // as delivery.mail "not_connected". replyTo: the company's reply address
  // set with the connector, the Reply-To of every message that names none
  // ("contact@<domain>" by default; null: none set). domain: the
  // company's (company.test); messages go from no-reply@<domain>. pace:
  // mail.limits.pace's; beyond it, "queued" until sendAt. A member's
  // email is refused (invalid_recipient).
  mail?: { connected?: boolean; replyTo?: string | null; domain?: string; pace?: { burst?: number; perMinute?: number }; suppressed?: string[] };
  // The calendar bridge (with "calendar" in capabilities): the Chest's
  // domain in UIDs, the tool's title in each event's category, the name of
  // the feed ("Atelier Martin" gives "Chest — Atelier Martin"; the Chest's
  // organization when left out), and a Chest without it (false: 404).
  calendar?: { domain?: string; toolTitle?: string; company?: string } | false;
  // The look the company chose (chest.theme()): for all its tools, and per
  // tool (by name). Held in chest.theme, which a test changes at any time.
  theme?: FakeTheme;
  // The files the Chest's front serves under /_chest/theme/ (the
  // catalogue's fonts, a brand's fonts and logo), by path below it.
  themeFiles?: Record<string, { data: Uint8Array | string; type?: string }>;
  // Webhooks ("webhooks": true; a studio.1 max bounds nothing). resolve
  // plays DNS (a
  // host name → the address it resolves to, "nxdomain": none; a name left
  // out resolves to a public address); deliver, when given, receives each
  // POST the Chest would make (a test's own receiver), otherwise every
  // target answers 200 until chest.webhooks.respond() says otherwise; to is
  // where webhook.disabled is posted (also chest.webhooks.to).
  webhooks?: { max?: number; resolve?: Record<string, string>; deliver?: (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<Response | number>; to?: Target };
  // The hosts the tool declares (chest.json "network") and who answers for
  // each — "graph.microsoft.com", "*.icloud.com" for every name below it,
  // "*" for any host. While the fake runs, the tool's plain fetch() goes as
  // through the Chest's egress proxy (below). Without this option, fetch()
  // is left alone.
  network?: Record<string, FakeNetworkHandler>;
};

// A fake Chest: 0.7.0's (api — here the studio's server —, token, tool,
// members, groups, files, folders, full, notifications, badges,
// acknowledged, ai, opens, realtime, emitted, deliver, run, act, close: the
// same values, read and written through), and what the studio's fakes keep
// and do.
export type FakeChest = Omit<OfficialFakeChest, "members"> & {
  members: StudioMember[];
  // Those the tool had who no longer have it: what lookup answers "former"
  // for (beside options.former, which 0.7.0's fake reads once), and leftAt.
  // A test that removes a member from chest.members moves them here, as a
  // real Chest would, then calls clearCaches().
  former: FakeFormer[];
  // upload plays a member's (or a visitor's) browser sending a file to an
  // uploadUrl's answer: a PUT of data, of that type — a visitor's path is
  // sent to the fake's origin (api).
  upload(url: string, data: Uint8Array | string, type: string): Promise<Response>;
  // Forgets what this process keeps of the Chest's answers — lookup's
  // minute and the theme — after a test changed chest.members, chest.former
  // or chest.theme by hand.
  clearCaches(): void;
  // Whether mail and webhooks deliver (available()).
  delivery: FakeDelivery;
  // Checks: those the tool configured, and check(), which delivers a result
  // to POST <to>/chest-checks, signed Chest-Check (ok by default).
  checks: { name: string; url: string; every: number; expect?: { status?: number; maxMs?: number } }[];
  check(name: string, to: Target, result?: { ok?: boolean; status?: number | null; ms?: number; error?: string | null; at?: string; id?: string }): Promise<number>;
  // Mail: what the tool sent to people outside, and bounce(), which plays
  // a message that could not be delivered: its status (mail.status) says
  // "bounced" ("complained" with complained: true), and a permanent bounce
  // or a complaint suppresses the address. Nothing is posted to the tool:
  // the Chest receives no mail.
  outbox: FakeMail[];
  bounce(message: string, options?: { recipient?: string; permanent?: boolean; complained?: boolean }): void;
  // The requests the tool's fetch() made outside (network).
  egress: FakeEgress[];
  // The calendar bridge: the events the tool put, by key; feed() is one
  // member's feed as the Chest writes it; feedUrl() its secret address on
  // the fake's front (/_chest/calendar/<secret>.ics), which newFeedUrl()
  // replaces (the old one answers 404).
  calendar: Map<string, FakeCalendarEvent>;
  feed(member: string, options?: { locale?: string; now?: Date }): string;
  feedUrl(member: string): string;
  newFeedUrl(member: string): string;
  // The company's look, both levels, and the files its front serves under
  // /_chest/theme/.
  theme: { all: FakeThemeChoice | null; tools: Record<string, FakeThemeChoice | null> };
  themeFiles: Map<string, { data: Uint8Array; type: string }>;
  // Webhooks: the targets, deliveries and events, and the controls that
  // play the receivers.
  webhooks: FakeWebhooks;
  // The tools installed on this Chest, as CHEST_TOOL_URLS gives them (this
  // tool included); installTool() and removeTool() play the owner
  // installing (or opening a public part) and removing one — the
  // environment is rewritten, as the Chest does before the tool's next
  // start.
  tools: Record<string, { teamUrl: string; publicUrl: string | null }>;
  installTool(name: string, addresses?: FakeToolAddresses | true): void;
  removeTool(name: string): void;
  // visitorHeaders plays the front for a visitor at this address:
  // Chest-Visitor-Address and Chest-Visitor (an HMAC under a secret drawn
  // at each run), with extra headers.
  visitorHeaders(address: string, extra?: Record<string, string>): Headers;
};

// completed is a test's member as the Chest would send them: the Chest's
// language and zone for those left out.
function completed<M extends FakeMember>(given: M, language = process.env["CHEST_LANGUAGE"] ?? "en", timeZone = process.env["CHEST_TIME_ZONE"] ?? "UTC"): StudioMember {
  return { ...given, language: given.language ?? language, timeZone: given.timeZone ?? timeZone } as StudioMember;
}

// The groups of the running fake Chest that do not give the tool
// (FakeGroup.grants: false), for a tool without "members.groups": a real
// Chest never puts them in that member's assertion, so signAssertion
// leaves them out while a fake runs (0.7.0's signs a member's groups as
// given).
let hiddenGroups: () => Set<string> = () => new Set();
const asserted = (member: FakeMember): StudioMember => {
  const full = completed(member);
  const hidden = hiddenGroups();
  return hidden.size === 0 || full.groups === null ? full : { ...full, groups: full.groups.filter(g => !hidden.has(g)) };
};

// signAssertion and withMember are 0.7.0's — withMember carries the
// member's Chest-Opener ticket for sealed values and folders while a fake
// runs —, for a member whose language and zone may be left out (the
// Chest's, CHEST_LANGUAGE and CHEST_TIME_ZONE; "en" and "UTC" outside a
// fake Chest), and whose groups that do not give the tool (while a fake
// runs, without "members.groups") are left out as the Chest leaves them
// out. The assertion carries exactly 0.7.0's claims.
export function signAssertion(member: FakeMember, options: AssertionOptions = {}): string {
  return officialSignAssertion(asserted(member), options);
}
export function withMember<R extends Request | IncomingMessage>(request: R, member: FakeMember, options: AssertionOptions = {}): R {
  return officialWithMember(request, asserted(member), options);
}

// 0.7.0's types that the studio does not redefine.
export type { AssertionOptions, FakeAi, FakeAiCall, FakeAiModel, FakeAiReply, FakeChannelRule, FakeDocument, FakeDocumentOpen, FakeEmits, FakeEmitted, FakeEvent, FakeFeed, FakeFile, FakeFolder, FakeFolders, FakeFoldersOptions, FakeGroup, FakeNotification, FakeOpen, FakePublished, FakeRealtime, FakeRealtimeOptions, FakeRun, FakeSent } from "../src/testing.js";

// The bounds the studio's fakes keep (0.7.0's own are in its fake).
const callsPerMinute = 600, matchPerCall = 200;

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


// ---- The declared network (0.3.0-studio.15) ----------------------------------------
//
// 0.7 declares a tool's hosts in chest.json ("network") and gives the tool
// the Chest's egress proxy; 0.7.0's fake has nothing for it: this plays it.
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

const hostPattern = /^(\*|(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+)$/u;
const direct = new Set(["localhost", "127.0.0.1", "::1"]);

function checkNetwork(network: Record<string, FakeNetworkHandler>): void {
  for (const [host, handler] of Object.entries(network)) {
    if (!hostPattern.test(host)) throw new Error(`fakeChest: network ${JSON.stringify(host)} is not a host name as chest.json "network" declares one (lower case, "*." for every name below, "*" for any)`);
    if (typeof handler !== "function") throw new Error(`fakeChest: network ${JSON.stringify(host)} needs a handler (request => Response)`);
  }
}

function routeNetwork(network: Record<string, FakeNetworkHandler>, log: FakeEgress[]): () => void {
  const handlerOf = (host: string): FakeNetworkHandler | undefined => {
    const exact = network[host];
    if (exact && Object.hasOwn(network, host)) return exact;
    if (Object.hasOwn(network, "*")) return network["*"];
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


// fakeChest starts 0.7.0's fake Chest and the studio's in front of it (see
// above), and points the environment at them: 0.7.0's variables (CHEST_API —
// the studio's server —, CHEST_TOKEN, CHEST_TOOL, CHEST_ORGANIZATION,
// CHEST_TIME_ZONE, CHEST_LANGUAGE, CHEST_TEAM_URL, CHEST_PUBLIC_URL) and the
// studio's CHEST_TOOL_URLS.
export async function fakeChest(options: FakeChestOptions = {}): Promise<FakeChest> {
  // Checked before anything starts: a wrong option leaves nothing running.
  if (options.tool !== undefined && !toolNamePattern.test(options.tool)) throw new Error(`fakeChest: ${JSON.stringify(options.tool)} is not a tool's name (chest.json "name")`);
  if (options.network) checkNetwork(options.network);
  const givenReply = options.mail?.replyTo;
  if (givenReply !== undefined && givenReply !== null && !isAddress(givenReply)) throw new Error("fakeChest: mail.replyTo is an email address, or null");
  if (options.mail && Object.hasOwn(options.mail, "perDay")) throw new Error("fakeChest: mail.perDay is gone (0.7.0-studio.2): no daily number, the Chest paces — mail: {pace: {burst, perMinute}}");
  if (options.mail && Object.keys(options.mail).some(k => !["connected", "replyTo", "domain", "pace", "suppressed"].includes(k))) throw new Error("fakeChest: mail is {connected, replyTo, domain, pace, suppressed} (mailboxes and received mail are gone: the Chest receives no mail)");
  if (options.storage && Object.keys(options.storage).some(k => k !== "publicFiles")) throw new Error("fakeChest: storage is {publicFiles} (a visitor's upload is 0.7.0's files.uploadUrl(folder, {public: true}))");
  if (options.chest && Object.hasOwn(options.chest, "currency")) throw new Error("fakeChest: the Chest has no currency (0.7.0): a tool keeps its own");
  for (const name of Object.keys(options.tools ?? {})) if (!toolNamePattern.test(name)) throw new Error(`fakeChest: ${JSON.stringify(name)} is not a tool's name (chest.json "name")`);
  const saved = { CHEST_TOOL: process.env["CHEST_TOOL"], CHEST_TOOL_URLS: process.env["CHEST_TOOL_URLS"] };
  if (options.tool !== undefined) process.env["CHEST_TOOL"] = options.tool;
  const capabilities = new Set(options.capabilities ?? ["members", "files", "notifications", "ai"]);
  const language = options.chest?.language ?? "en", zone = options.chest?.timeZone ?? "UTC";
  const { tool: _tool, members: givenMembers, former: givenFormer, tools: _tools, visitors: _visitors, checks: _checks, delivery: _delivery, storage: _storage, mail: _mail, calendar: _calendar, theme: _theme, themeFiles: _themeFiles, webhooks: _webhooks, network: _network, ...officialOptions } = options;
  void [_tool, _tools, _visitors, _checks, _delivery, _storage, _mail, _calendar, _theme, _themeFiles, _webhooks, _network];
  // 0.7.0's fake keeps the members (completed: a Chest gives every member a
  // language and a zone) and the former as given (without leftAt, the
  // studio's).
  const official = await officialFakeChest({ ...officialOptions, members: (givenMembers ?? []).map(m => completed(m, language, zone)), former: (givenFormer ?? []).map(({ leftAt: _leftAt, ...f }) => f) });
  const upstream = official.api;
  // Without "members.groups", the groups that do not give the tool are not
  // in an assertion (signAssertion, withMember).
  const hiding = () => capabilities.has("members.groups") ? new Set<string>() : new Set(official.groups.filter(g => g.grants === false).map(g => g.id));
  hiddenGroups = hiding;
  const tool = official.tool, token = official.token;
  const teamOrigin = (): string => process.env["CHEST_TEAM_URL"] ?? `https://${tool}-chest.chest.test`;

  // The studio's object: every field of 0.7.0's read and written through
  // (a test that sets chest.members sets 0.7.0's; chest.deliver is 0.7.0's),
  // and the studio's own.
  const chest = {
    former: [...(givenFormer ?? [])],
    // A path (a visitor's upload) is sent to the fake's own origin.
    upload: async (url: string, data: Uint8Array | string, type: string) => fetch(new URL(url, official.api), { method: "PUT", body: typeof data === "string" ? data : new Uint8Array(data), headers: { "Content-Type": type } }),
    clearCaches: () => {},
    delivery: { mail: options.delivery?.mail ?? (options.mail?.connected === false ? "not_connected" : "ready"), webhooks: options.delivery?.webhooks ?? "ready" },
    checks: [],
    check: async () => 0,
    outbox: [],
    bounce: () => {},
    egress: [],
    calendar: new Map(),
    feed: () => "",
    feedUrl: () => "",
    newFeedUrl: () => "",
    theme: { all: options.theme?.all ?? null, tools: { ...options.theme?.tools } },
    themeFiles: new Map(Object.entries(options.themeFiles ?? {}).map(([path, f]) => [path, { data: typeof f.data === "string" ? new TextEncoder().encode(f.data) : f.data, type: f.type ?? "application/octet-stream" }])),
    webhooks: { targets: [], deliveries: [], events: [], to: options.webhooks?.to ?? null, respond: () => {}, retry: async () => 0 },
    tools: {},
    installTool: () => {},
    removeTool: () => {},
    visitorHeaders: (address: string, extra: Record<string, string> = {}) => new Headers({ ...extra, "chest-visitor-address": address, "chest-visitor": createHmac("sha256", visitorKey).update(`${tool}|${address}`).digest("base64url").slice(0, 22) }),
  } as unknown as FakeChest;
  // The Chest's own key for visitors' keys (visitors.visitor): drawn at
  // each run, never in the tool's environment.
  const visitorKey = randomBytes(32);
  for (const name of Object.keys(official) as (keyof OfficialFakeChest)[]) {
    if (name === "close") continue;
    Object.defineProperty(chest, name, {
      get: () => official[name],
      set: (value: unknown) => { (official as Record<string, unknown>)[name] = value; },
      enumerable: true,
      configurable: true,
    });
  }

  // The windows of the studio's quotas, each from the first call it counts.
  type Window = { start: number; count: number };
  const live = (w: Window | undefined, span: number, now: number): boolean => w !== undefined && w.count > 0 && now - w.start < span;
  const wait = (w: Window, span: number, now: number): Record<string, string> => ({ "Retry-After": String(Math.max(1, Math.ceil((w.start + span - now) / 1000))) });
  const count = (w: Window, span: number, now: number, n: number): void => {
    if (!live(w, span, now)) [w.start, w.count] = [now, 0];
    w.count += n;
  };
  const access = (id: string) => chest.members.some(m => m.id === id);
  // post delivers what the Chest posts to the tool on one of its channels —
  // at its address, or to a handler — signed with 0.7.0's signed.ts, and
  // says the status it answered.
  const deliverTo = async (path: string, channel: Channel, id: string, body: string, to: Target): Promise<number> => {
    const request = new Request((typeof to === "string" ? to.replace(/\/$/u, "") : "http://tool.test") + path, { method: "POST", headers: { "Content-Type": "application/json", [channel.header]: sign(channel, id, body, { token, tool }) }, body });
    const answer = typeof to === "string" ? await fetch(request, { redirect: "manual" }) : await to(request);
    await answer.body?.cancel();
    return answer.status;
  };

  // Checks run by the Chest (Studio proposal): the list the tool configured.
  async function checksRoute(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!options.checks) return send(response, 404, { error: "not_found" });
    if (request.method === "GET") return send(response, 200, { checks: chest.checks });
    if (request.method !== "PUT") return send(response, 404, { error: "not_found" });
    // No number of checks: the Chest paces its probes instead.
    const raw = await body(request, 4 << 20);
    if (raw === null) return send(response, 413, { error: "too_large" });
    let c: Record<string, unknown>;
    try { c = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { return send(response, 400, { error: "invalid_checks" }); }
    const given = c["checks"];
    if (!Array.isArray(given)) return send(response, 400, { error: "invalid_checks" });
    chest.checks = given as FakeChest["checks"];
    send(response, 200, { checks: chest.checks });
  }

  // Webhooks (Studio proposal): the targets the tool added, the
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
    try {
      kept.status = await deliverTo("/chest-webhooks", webhooksChannel, id, body, to);
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
    const due = hooks.deliveries.filter(d => d.status === "retrying" || (d.status === "pending" && d.nextAttemptAt !== null));
    hookHour = { start: 0, count: 0 };
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
    // Proposal (0.3.0-studio.16): whether the Chest would deliver, without sending.
    if (url.pathname === "/webhooks/status" && request.method === "GET") return send(response, 200, { state: chest.delivery.webhooks, targets: hooks.targets.length, max: null });
    // Paused by the owner: nothing is added or sent.
    if (chest.delivery.webhooks === "suspended" && request.method === "POST" && (url.pathname === "/webhooks" || url.pathname === "/webhooks/send")) return send(response, 409, { error: "suspended" });
    if (url.pathname === "/webhooks" && request.method === "GET") return send(response, 200, { targets: hooks.targets.map(shownTarget) });
    if (url.pathname === "/webhooks" && request.method === "POST") {
      const given = await readBody();
      // The Chest checks what the SDK checked: the same rules.
      if (!given || checkWebhookInput(given).length > 0) return send(response, 400, { error: "invalid_target" });
      // No number of targets; new ones are paced (an add resolves and
      // calls an address someone typed): slow down, try again later.
      if (!live(hookAdds, 3_600_000, now)) hookAdds = { start: now, count: 0 };
      if (hookAdds.count >= webhookLimits.addsPerHour) return send(response, 429, { error: "rate_limited" }, wait(hookAdds, 3_600_000, now));
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
      // event is refused, nothing sent (0.3.0-studio.15).
      if ((ids as string[]).some(id => { const d = hookKeys.get(id + "\u0000" + key); return fresh(d) && d!.event !== message["event"]; })) return send(response, 409, { error: "key_conflict" });
      const plan = [...new Set(ids as string[])].map(id => {
        const t = hooks.targets.find(x => x.id === id);
        if (!t) return { id, skip: "not_found" as const };
        const first = hookKeys.get(id + "\u0000" + key);
        if (fresh(first)) return { id, existing: first! };
        if (t.state === "disabled") return { id, skip: "disabled" as const };
        return { id, target: t };
      });
      // Never refused for how many: beyond the hour's pace, a delivery
      // waits in the queue (pending, its turn at nextAttemptAt).
      if (!live(hookHour, 3_600_000, now)) hookHour = { start: now, count: 0 };
      const turn = new Date(hookHour.start + 3_600_000).toISOString();
      const heldBack = new Set<string>();
      const answer: { deliveries: { id: string; target: string }[]; skipped: { target: string; reason: string }[] } = { deliveries: [], skipped: [] };
      for (const p of plan) {
        if ("skip" in p) { answer.skipped.push({ target: p.id, reason: p.skip! }); continue; }
        if ("existing" in p) { answer.deliveries.push({ id: p.existing!.id, target: p.id }); continue; }
        const d: FakeWebhookDelivery = { id: hookId("whd_"), target: p.id, event: message["event"] as string, key, status: "pending", attempts: 0, responseStatus: null, lastError: null, createdAt: new Date(now).toISOString(), deliveredAt: null, nextAttemptAt: null, text: message["text"] as string, ...(message["data"] ? { data: message["data"] as Record<string, unknown> } : {}), request: null };
        if (hookHour.count >= webhookLimits.deliveriesPerHour) {
          d.nextAttemptAt = turn;
          heldBack.add(d.id);
        } else hookHour.count++;
        hooks.deliveries.push(d);
        hookKeys.set(p.id + "\u0000" + key, d);
        answer.deliveries.push({ id: d.id, target: p.id });
      }
      // The Chest answers at once and delivers within seconds; the fake
      // makes each first attempt before it answers, so a test reads the
      // outcome right after send().
      for (const p of answer.deliveries) {
        const d = hooks.deliveries.find(x => x.id === p.id)!;
        if (d.status === "pending" && !heldBack.has(d.id)) await attempt(d);
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

  // Visitors of the public host (Studio proposal): counts per visitor
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
    if (typeof name !== "string" || !/^[a-z][a-z0-9-]{0,31}$/u.test(name) || (address !== null && typeof address !== "string") || !(typeof perVisitor === "number" || (perVisitor === null && address === null)) || typeof perHour !== "number") return send(response, 400, { error: "invalid_body" });
    const now = Date.now();
    // A visitor without an address is counted only in the ceiling for
    // everyone: never per visitor nor per address, which would make all
    // unknown visitors one.
    const windows: (readonly [string, number])[] = address === null ? [[`n|${name}`, perHour]] : [[`v|${name}|${address}`, perVisitor as number], [`n|${name}`, perHour], [`a|${address}`, perAddressHour]];
    for (const [k] of windows) if (!visitorCounts.has(k)) visitorCounts.set(k, { start: 0, count: 0 });
    const full = windows.find(([k, max]) => live(visitorCounts.get(k), 3_600_000, now) && visitorCounts.get(k)!.count >= max);
    if (full) {
      const w = visitorCounts.get(full[0])!;
      return send(response, 200, { allowed: false, retry_after: Math.max(1, Math.ceil((w.start + 3_600_000 - now) / 1000)) });
    }
    for (const [k] of windows) count(visitorCounts.get(k)!, 3_600_000, now, 1);
    send(response, 200, { allowed: true, retry_after: 0 });
  }

  // Mail to people outside (Studio proposal): send, status, available.
  const mailOptions = options.mail ?? {};
  const domain = mailOptions.domain ?? "company.test";
  const replyTo = (): string | null => mailOptions.replyTo === undefined ? `contact@${domain}` : mailOptions.replyTo;
  const suppressed = new Set((mailOptions.suppressed ?? []).map(a => a.toLowerCase()));
  // What a key answered, for 24 hours, and who it went to.
  const sentKeys = new Map<string, { answer: Record<string, unknown>; recipients: string; at: number }>();
  // The pace: a bucket of burst messages, filled perMinute a minute; a
  // message without one waits its turn after those already waiting.
  const pace = { burst: mailOptions.pace?.burst ?? 100, perMinute: mailOptions.pace?.perMinute ?? 10 };
  let paceTokens = pace.burst, paceAt = Date.now(), paceTail = 0;
  const paced = (now: number): number | null => {
    paceTokens = Math.min(pace.burst, paceTokens + ((now - paceAt) / 60_000) * pace.perMinute);
    paceAt = now;
    if (paceTokens >= 1 && paceTail <= now) {
      paceTokens -= 1;
      return null;
    }
    paceTail = Math.max(paceTail, now) + 60_000 / pace.perMinute;
    return paceTail;
  };
  const due = (m: FakeMail): FakeMail => {
    if (m.status === "queued" && m.sendAt !== undefined && Date.parse(m.sendAt) <= Date.now()) m.status = "sent";
    return m;
  };
  const newId = (prefix: string) => prefix + Array.from(randomBytes(26), b => "abcdefghijklmnopqrstuvwxyz234567"[b & 31]).join("");
  const mailKeys = new Set(["to", "cc", "subject", "text", "html", "from_name", "reply_to", "attachments", "key"]);
  async function mailRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (!capabilities.has("mail")) return send(response, 404, { error: "not_found" });
    // Whether the Chest would deliver, without sending; the company's reply address.
    if (url.pathname === "/mail/status" && request.method === "GET") {
      return send(response, 200, { send: chest.delivery.mail, remaining_today: null, reply_to: replyTo() });
    }
    const one = /^\/mail\/messages\/(msg_[a-z2-7]{26})$/u.exec(url.pathname);
    if (request.method === "GET" && one) {
      const found = chest.outbox.find(x => x.id === one[1]);
      const m = found ? due(found) : undefined;
      return m ? send(response, 200, { id: m.id, status: m.status, at: new Date().toISOString() }) : send(response, 404, { error: "not_found" });
    }
    if (request.method !== "POST" || url.pathname !== "/mail/messages") return send(response, 404, { error: "not_found" });
    // The owner has not connected the company's mail provider, or the
    // Chest stopped sending: nothing is sent (send throws Unavailable).
    if (chest.delivery.mail === "not_connected") return send(response, 503, { error: "not_connected" });
    if (chest.delivery.mail === "suspended") return send(response, 503, { error: "unavailable" });
    const raw = await body(request, 16 << 20);
    if (raw === null) return send(response, 413, { error: "too_large" });
    let m: Record<string, unknown>;
    try { m = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { return send(response, 400, { error: "invalid_message" }); }
    if (m === null || typeof m !== "object" || Array.isArray(m) || Object.keys(m).some(k => !mailKeys.has(k))) return send(response, 400, { error: "invalid_message" });
    const key = m["key"];
    if (key !== undefined && (typeof key !== "string" || !wireKeyPattern.test(key))) return send(response, 400, { error: "invalid_message" });
    // Addresses only: a member is never a recipient (notify them).
    const addresses = (list: unknown): string[] | "member" | null => {
      if (!Array.isArray(list)) return null;
      for (const r of list) {
        if ((r !== null && typeof r === "object") || (typeof r === "string" && !r.includes("@") && /^\s*mbr_/iu.test(r))) return "member";
        if (!isAddress(r)) return null;
      }
      return list as string[];
    };
    const to = addresses(m["to"]), cc = addresses(m["cc"] ?? []);
    if (to === "member" || cc === "member") return send(response, 400, { error: "invalid_recipient" });
    // The Chest knows its members' addresses: a member is told with a
    // notification, never mailed by their address (a former member is
    // outside the company now).
    const theirs = new Set(chest.members.flatMap(x => x.email === undefined ? [] : [x.email.trim().toLowerCase()]));
    if (to && cc && [...to, ...cc].some(a => theirs.has(a.trim().toLowerCase()))) return send(response, 400, { error: "invalid_recipient" });
    if (!to || !cc || to.length < 1 || to.length + cc.length > 50) return send(response, 400, { error: "invalid_address" });
    // What the Chest checks whatever the SDK did (a tool that bypassed it):
    // headers that cannot be split, attachments it can send.
    const headerSafe = (v: unknown, max: number) => typeof v === "string" && v.length <= max && !/[\u0000-\u0008\u000a-\u001f\u007f\u0085\u2028\u2029]/u.test(v);
    if (!headerSafe(m["subject"], 998) || (m["subject"] as string).trim() === "" || typeof m["text"] !== "string" || (m["html"] !== undefined && typeof m["html"] !== "string")) return send(response, 400, { error: "invalid_message" });
    if (m["from_name"] !== undefined && !headerSafe(m["from_name"], 100)) return send(response, 400, { error: "invalid_message" });
    if (m["reply_to"] !== undefined && !isAddress(m["reply_to"])) return send(response, 400, { error: "invalid_address" });
    const given = m["attachments"] ?? [];
    if (!Array.isArray(given) || !given.every(a => {
      const one = a !== null && typeof a === "object" && !Array.isArray(a) ? a as Record<string, unknown> : null;
      if (!one) return false;
      if ("file" in one) return typeof one["file"] === "string" && chest.files.has(one["file"]) && (one["name"] === undefined || headerSafe(one["name"], 255)) && Object.keys(one).every(k => k === "file" || k === "name");
      return headerSafe(one["name"], 255) && headerSafe(one["type"], 255) && typeof one["content"] === "string" && Object.keys(one).every(k => k === "name" || k === "type" || k === "content");
    })) return send(response, 400, { error: "invalid_message" });
    // The same key within 24 hours answers the first message — for the
    // same recipients only: a key reused for others (a key cut by the
    // tool, which lost the recipient) is refused, nothing sent.
    const fingerprint = JSON.stringify([...to, ...cc].map(a => a.toLowerCase()).sort());
    const first = typeof key === "string" ? sentKeys.get(key) : undefined;
    if (first && Date.now() - first.at < 86_400_000) return first.recipients === fingerprint ? send(response, 200, first.answer) : send(response, 409, { error: "key_conflict" });
    const allowed = [...to, ...cc].filter(a => !suppressed.has(a.toLowerCase()));
    if (allowed.length === 0) return send(response, 422, { error: "suppressed" });
    const now = Date.now();
    // Never refused for how many: beyond the pace, it waits its turn.
    const sendAt = paced(now);
    const attachments = (given as Record<string, unknown>[]).map(a => typeof a["file"] === "string"
      ? { name: String(a["name"] ?? a["file"]), type: chest.files.get(a["file"])!.type, size: chest.files.get(a["file"])!.data.byteLength }
      : { name: String(a["name"]), type: String(a["type"]), size: Buffer.from(String(a["content"]), "base64").byteLength });
    const id = newId("msg_");
    // Reply-To: the tool's, or the company's reply address set with the connector.
    const reply = typeof m["reply_to"] === "string" ? m["reply_to"] : replyTo();
    const kept: FakeMail = {
      id, messageId: `<${id}@${domain}>`,
      from: `no-reply@${domain}`,
      fromName: typeof m["from_name"] === "string" ? m["from_name"] : null,
      to: to.filter(a => allowed.includes(a)), cc: cc.filter(a => allowed.includes(a)),
      subject: m["subject"] as string, text: m["text"] as string,
      ...(typeof m["html"] === "string" ? { html: m["html"] } : {}),
      ...(reply !== null ? { replyTo: reply } : {}),
      attachments,
      ...(typeof key === "string" ? { key } : {}),
      status: sendAt === null ? "sent" : "queued",
      ...(sendAt !== null ? { sendAt: new Date(sendAt).toISOString() } : {}),
    };
    chest.outbox.push(kept);
    const answer = { id, message_id: kept.messageId, status: "queued" };
    if (typeof key === "string") sentKeys.set(key, { answer, recipients: fingerprint, at: now });
    send(response, 201, answer);
  }

  // The calendar bridge (Studio proposal): the tool's events, by key.
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
    // Proposal (0.3.0-studio.15, per event since 0.3.0-studio.16): a batch of 1 to 100
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
    return calendarFeed(events.map(e => ({ ...e, tool, origin: teamOrigin(), ...(calendarOptions?.toolTitle ? { toolTitle: calendarOptions.toolTitle } : {}) })), { locale: locale ?? who?.language ?? "en", domain: calendarDomain, name: feedName(), ...(now ? { now } : {}) });
  };

  // ---- Members: matchEmails, leftAt ----
  let window = 0, calls = 0;
  const matchDay: Window = { start: 0, count: 0 }, matchedToday = new Set<string>();
  let matchPacedAt = -Infinity;
  const readJson = async (request: IncomingMessage, limit: number): Promise<Record<string, unknown> | null> => {
    const raw = await body(request, limit);
    try {
      const value = JSON.parse(raw?.toString() ?? "") as unknown;
      return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
    } catch {
      return null;
    }
  };
  async function membersRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (!capabilities.has("members")) return send(response, 403, { error: "capability_not_granted" });
    const now = Date.now();
    if (now - window >= 60_000) [window, calls] = [now, 0];
    if (++calls > callsPerMinute) return send(response, 429, { error: "rate_limited" }, { "Retry-After": "60" });
    if (request.method === "POST" && url.pathname === "/members/match") {
      const emails = (await readJson(request, 128 << 10))?.["emails"];
      if (!Array.isArray(emails) || emails.length > matchPerCall || !emails.every(e => typeof e === "string" && e.length <= 254)) return send(response, 400, { error: "invalid_body" });
      const asked = [...new Set((emails as string[]).map(e => e.trim().toLowerCase()))];
      if (!live(matchDay, 86_400_000, now)) {
        [matchDay.start, matchDay.count] = [now, 0];
        matchedToday.clear();
      }
      const fresh = asked.filter(e => !matchedToday.has(e));
      // The day's new addresses at full speed: ten for each member of the
      // Chest, 1,000 at least; beyond, a call with new addresses a minute
      // (rate_limited: slow down) — a list of guesses goes slowly, a real
      // list goes through.
      const allowance = Math.max(matchLimits.minimumPerDay, matchLimits.perMemberPerDay * chest.members.length);
      if (fresh.length > 0 && matchedToday.size + fresh.length > allowance) {
        if (now - matchPacedAt < 60_000) return send(response, 429, { error: "rate_limited" }, { "Retry-After": String(Math.max(1, Math.ceil((matchPacedAt + 60_000 - now) / 1000))) });
        matchPacedAt = now;
      }
      for (const e of fresh) matchedToday.add(e);
      matchDay.count = matchedToday.size;
      const matches = asked.flatMap(e => {
        const m = chest.members.find(x => x.email !== undefined && x.email.toLowerCase() === e);
        return m ? [{ email: e, id: m.id }] : [];
      });
      return send(response, 200, { matches });
    }
    if (request.method === "POST" && url.pathname === "/members/left") {
      const ids = (await readJson(request, 64 << 10))?.["ids"];
      if (!Array.isArray(ids) || ids.length > 200) return send(response, 400, { error: "invalid_body" });
      if (!ids.every(id => typeof id === "string" && memberIdPattern.test(id))) return send(response, 400, { error: "invalid_id" });
      const left = [...new Set(ids as string[])].flatMap(id => {
        const f = access(id) ? undefined : chest.former.find(x => x.id === id && (x.status ?? "former") !== "no_access");
        return f?.leftAt ? [{ id, left_at: f.leftAt }] : [];
      });
      return send(response, 200, { left });
    }
    send(response, 404, { error: "not_found" });
  }

  // completeMembers is what the studio adds to 0.7.0's answer of lookup:
  // its "former" are also the studio's list as it is now (chest.former, which
  // a test may change after the start; 0.7.0's fake reads options.former
  // once).
  const completeMembers = (url: URL, answer: unknown): unknown => {
    const path = url.pathname;
    const o = answer !== null && typeof answer === "object" && !Array.isArray(answer) ? answer as Record<string, unknown> : null;
    if (!o) return answer;
    if (path === "/members/lookup" && Array.isArray(o["unknown"]) && Array.isArray(o["former"])) {
      const unknown: string[] = [];
      for (const id of o["unknown"] as string[]) {
        const f = chest.former.find(x => x.id === id);
        const status = f?.status ?? "former";
        if (!f) unknown.push(id);
        else if (status === "erased") (o["former"] as unknown[]).push({ id, status: "erased" });
        else if (status === "no_access") (o["former"] as unknown[]).push({ id, name: f.name ?? "Test member", status: "no_access" });
        else (o["former"] as unknown[]).push({ id, ...(f.name ? { name: f.name } : {}), status: "former" });
      }
      o["unknown"] = unknown;
    }
    return o;
  };

  // ---- The look ----
  // This tool's override, or the company's choice for all tools, or nothing
  // (its own identity) — never kept by the tool (max-age=0), so a test's or
  // a harness's switch shows at once.
  async function themeRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (request.method !== "GET" || url.search) return send(response, 404, { error: "not_found" });
    const own = chest.theme.tools[tool];
    const chosen = own ?? chest.theme.all;
    const scope = own ? "tool" : chest.theme.all ? "chest" : "default";
    send(response, 200, { ...(chosen ?? { mode: "own" }), scope }, { "Cache-Control": "max-age=0" });
  }

  // ---- The front's routes of the proposals ----
  // What a Chest's front would serve beside the tool, under /_chest/: the
  // public files, the look's files, a member's calendar feed and its page,
  // the members' photos. 0.7.0's fake serves the rest of /_chest/ (files'
  // links and uploads, a visitor's upload, realtime) and the documents
  // host of Files (/d/, /u/).
  async function frontRoute(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const shared = /^\/_chest\/public\/(.+)$/u.exec(url.pathname);
    if (shared && request.method === "GET") {
      let name = "";
      try { name = "public/" + decodeURIComponent(shared[1]!); } catch { name = ""; }
      const object = options.storage?.publicFiles ? chest.files.get(name) : undefined;
      if (!object) return send(response, 404, { error: "not_found" });
      return void response.writeHead(200, { "Content-Type": object.type, "Content-Length": String(object.data.byteLength), "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" }).end(object.data);
    }
    // The look's files (fonts, logo), public on both hosts.
    const look = /^\/_chest\/theme\/([A-Za-z0-9._~\-/]+)$/u.exec(url.pathname);
    if (look && request.method === "GET") {
      const file = look[1]!.includes("..") ? undefined : chest.themeFiles.get(look[1]!);
      if (!file) return send(response, 404, { error: "not_found" });
      return void response.writeHead(200, { "Content-Type": file.type, "Content-Length": String(file.data.byteLength), "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" }).end(file.data);
    }
    // A member's calendar feed, and the page where they find its address
    // ("Add your Chest calendar") — shown to the member the front signs in
    // (a harness adds the assertion, as on /chest).
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

  // ---- 0.7.0's fake, behind ----
  // relay passes a request to 0.7.0's fake as it came, and its answer back
  // as it went — completed, for lookup, by completeMembers.
  const upstreamPort = Number(new URL(upstream).port);
  function relay(request: IncomingMessage, response: ServerResponse, url: URL): void {
    const complete = url.pathname === "/members/lookup";
    const headers = { ...request.headers, host: `127.0.0.1:${upstreamPort}` };
    const forward = httpRequest({ host: "127.0.0.1", port: upstreamPort, method: request.method, path: request.url, headers }, answer => {
      if (!complete || answer.statusCode !== 200 || !(answer.headers["content-type"] ?? "").startsWith("application/json")) {
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(response);
        return;
      }
      const chunks: Buffer[] = [];
      answer.on("data", (chunk: Buffer) => chunks.push(chunk));
      answer.on("end", () => {
        let value: unknown;
        try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { value = null; }
        const { "content-length": _length, "content-type": _type, ...rest } = answer.headers;
        void [_length, _type];
        send(response, 200, completeMembers(url, value), Object.fromEntries(Object.entries(rest).filter((e): e is [string, string] => typeof e[1] === "string")));
      });
      answer.on("error", () => response.destroy());
    });
    forward.on("error", () => { if (!response.headersSent) send(response, 503, { error: "unavailable" }); else response.destroy(); });
    // A client that goes away takes its relayed request with it.
    response.on("close", () => { if (!response.writableFinished) forward.destroy(); });
    request.pipe(forward);
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    const front = path.startsWith("/_chest/public/") || path.startsWith("/_chest/theme/") || path === "/_chest/calendar" || path.startsWith("/_chest/calendar/") || /^\/_chest\/members\/[^/]+\/photo$/u.test(path);
    const route = path === "/members/match" || path === "/members/left" ? membersRoute
      : front ? frontRoute
      : path.startsWith("/mail/") ? mailRoute
      : path === "/calendar/events" || path.startsWith("/calendar/events/") ? calendarRoute
      : path === "/theme" ? themeRoute
      : path === "/visitors/count" ? (request: IncomingMessage, response: ServerResponse) => visitorsRoute(request, response)
      : path === "/checks" ? (request: IncomingMessage, response: ServerResponse) => checksRoute(request, response)
      : path === "/webhooks" || path.startsWith("/webhooks/") ? webhooksRoute
      : null;
    if (!route) {
      // The members API's 600 calls a minute are one budget for 0.7.0's
      // routes and the studio's (matchEmails, leftAt): counted here too
      // before 0.7.0's fake counts its own.
      if (path === "/members" || path.startsWith("/members/") || path === "/groups") {
        const now = Date.now();
        if (now - window >= 60_000) [window, calls] = [now, 0];
        if (++calls > callsPerMinute) return send(response, 429, { error: "rate_limited" }, { "Retry-After": "60" });
      }
      return relay(request, response, url);
    }
    route(request, response, url).catch(() => { if (!response.headersSent) send(response, 503, { error: "unavailable" }); else response.destroy(); });
  });
  // A page's realtime connection (an HTTP upgrade on /_chest/realtime) goes
  // to 0.7.0's fake as it came, byte for byte both ways.
  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const upstreamSocket = connectSocket(upstreamPort, "127.0.0.1", () => {
      const lines = [`${request.method ?? "GET"} ${request.url ?? "/"} HTTP/${request.httpVersion}`];
      for (let i = 0; i < request.rawHeaders.length; i += 2) {
        const name = request.rawHeaders[i]!, value = request.rawHeaders[i + 1]!;
        lines.push(`${name}: ${name.toLowerCase() === "host" ? `127.0.0.1:${upstreamPort}` : value}`);
      }
      upstreamSocket.write(lines.join("\r\n") + "\r\n\r\n");
      if (head.length > 0) upstreamSocket.write(head);
      socket.pipe(upstreamSocket).pipe(socket);
    });
    const end = () => { socket.destroy(); upstreamSocket.destroy(); };
    upstreamSocket.on("error", end);
    socket.on("error", end);
    upstreamSocket.on("close", () => socket.destroy());
    socket.on("close", () => upstreamSocket.destroy());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  // The fake's address is the studio's server: CHEST_API, and the origin of
  // the links, uploads and realtime addresses 0.7.0's fake writes (it
  // writes them with its api).
  official.api = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  process.env["CHEST_API"] = official.api;

  // ---- The tools installed beside this one (chest.tools) ----
  const writeTools = () => {
    process.env["CHEST_TOOL_URLS"] = JSON.stringify(chest.tools);
  };
  const addresses = (name: string, given: FakeToolAddresses | true | undefined) => {
    if (!toolNamePattern.test(name)) throw new Error(`fakeChest: ${JSON.stringify(name)} is not a tool's name (chest.json "name")`);
    const value = given === true || given === undefined ? {} : given;
    return { teamUrl: value.teamUrl ?? `https://${name}-chest.chest.test`, publicUrl: value.publicUrl ?? null };
  };
  chest.tools = { [tool]: { teamUrl: teamOrigin(), publicUrl: process.env["CHEST_PUBLIC_URL"] ?? null } };
  for (const [name, given] of Object.entries(options.tools ?? {})) if (name !== tool) chest.tools[name] = addresses(name, given);
  chest.installTool = (name, given) => {
    if (name === tool) throw new Error("fakeChest.installTool: this tool is already installed (its addresses are chest: {teamUrl, publicUrl})");
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
  // The declared network: the tool's fetch() as through the Chest's egress
  // proxy, while the fake runs.
  const unpatch = options.network ? routeNetwork(options.network, chest.egress) : () => {};

  // ---- What the Chest posts to the tool, on the studio's channels ----
  chest.check = async (name, to, given = {}) => {
    if (!chest.checks.some(c => c.name === name)) throw new Error(`fakeChest: no check named ${name} (the tool has not configured it)`);
    const id = given.id ?? newId("chk_");
    const ok = given.ok ?? true;
    const body = JSON.stringify({ id, name, at: given.at ?? new Date().toISOString(), ok, status: given.status === undefined ? (ok ? 200 : 503) : given.status, ms: given.ms ?? 120, error: given.error === undefined ? (ok ? null : "status") : given.error });
    return deliverTo("/chest-checks", checkChannel, id, body, to);
  };
  // bounce plays a message that could not be delivered (or that the
  // person marked as spam): its status says so, and the address is
  // suppressed when the failure is permanent or a complaint. Nothing is
  // posted to the tool (the Chest receives no mail): the tool reads
  // mail.status(id).
  chest.bounce = (messageId, given = {}) => {
    const sent = chest.outbox.find(m => m.id === messageId);
    if (!sent) throw new Error(`fakeChest: no message ${messageId} in the outbox`);
    const recipient = given.recipient ?? [...sent.to, ...sent.cc][0];
    if (recipient === undefined || ![...sent.to, ...sent.cc].some(a => a.toLowerCase() === recipient.toLowerCase())) throw new Error(`fakeChest: ${String(recipient)} is not a recipient of ${messageId}`);
    sent.status = given.complained ? "complained" : "bounced";
    if (given.complained || (given.permanent ?? true)) suppressed.add(recipient.toLowerCase());
  };
  // The calendar's inspection: a member's feed address, on the team host
  // as the Chest gives it (CHEST_TEAM_URL); the fake's front serves its
  // path (chest.api + its pathname).
  chest.feedUrl = id => {
    if (!memberIdPattern.test(id)) throw new Error("fakeChest.feedUrl: a member id");
    if (!feeds.has(id)) feeds.set(id, secret());
    return `${teamOrigin()}/_chest/calendar/${feeds.get(id)}.ics`;
  };
  chest.newFeedUrl = id => {
    feeds.set(id, secret());
    return chest.feedUrl(id);
  };
  chest.feed = (id, given = {}) => writeFeed(id, given.locale, given.now);
  chest.close = async () => {
    unpatch();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await official.close();
    if (hiddenGroups === hiding) hiddenGroups = () => new Set();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    forget();
    forgetTheme();
  };
  return chest;
}

