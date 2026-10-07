import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { chest } from "../../../packages/chest-client/src/chest.js";
import { ChestError } from "../../../packages/chest-client/src/errors.js";
import { member } from "../../../packages/chest-client/src/member.js";
import type { Member } from "../../../packages/chest-client/src/member.js";
import type { Group } from "../../../packages/chest-client/src/members.js";
import type { Notice } from "../../../packages/chest-client/src/notifications.js";
import * as realtime from "../../../packages/chest-client/src/realtime.js";
import type { Assistant } from "./assistant.js";
import { chatText, type Chat } from "./chat.js";
import { probeTargets, type Database, type ProbeTarget } from "./database.js";
import { egress, egressTargets, type EgressTarget } from "./egress.js";
import type { Files } from "./files.js";
import type { Lifecycle } from "./lifecycle.js";
import type { Schedules } from "./schedules.js";
import { maxValue, secretLabel, type Secrets } from "./secrets.js";
import type { Team } from "./members.js";
import { noteText, type NoteStore } from "./notes.js";
import { applyPage, chatPage, errorPage, membersPage, publicPage, teamPage, type ChestView } from "./pages.js";

// The version the tool shows on its public page: the laboratory's GitHub
// changes it in a second commit to prove an update.
export const version = "v1";

// The largest body the tool reads: a note is 280 characters; a file a
// member puts, 64 KiB.
const maxBody = 4096;
const maxFile = 64 << 10;
// What the browser gets besides the body. The team part carries a member's
// data: never cached, never framed, scripts of its own origin only.
const common = { "X-Content-Type-Options": "nosniff" };
const team = { ...common, "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" };

// Files served as they are: the style sheet under /static/ (a static prefix
// of the manifest, forwarded by the Chest on both hosts without any
// identity) and the script of the team page, compiled beside this module.
const stylesheet = readFileSync(new URL("../../../../apps/testweb/static/site.css", import.meta.url));
const script = readFileSync(new URL("./client.js", import.meta.url));
// The chat page's script imports the SDK's browser client, which the bench
// serves beside it under /chest (a tool bundles it with its own script).
const sdkClient = "../../../packages/chest-client/src/realtime-client.js";
const chatScript = readFileSync(new URL("./chat-client.js", import.meta.url), "utf8").replace(`"${sdkClient}"`, `"./realtime-client.js"`);
const realtimeClient = readFileSync(new URL(sdkClient, import.meta.url));
const applyScript = readFileSync(new URL("./apply.js", import.meta.url));
// A visitor's file: a PDF of 1 MiB at most, into applications/.
const applications = "applications/";

function send(response: ServerResponse, status: number, headers: Record<string, string>, body: string | Buffer = ""): void {
  const raw = typeof body === "string" ? Buffer.from(body) : body;
  response.writeHead(status, { ...headers, "Content-Length": String(raw.length) });
  response.end(raw);
}
function html(response: ServerResponse, status: number, headers: Record<string, string>, body: string): void {
  send(response, status, { ...headers, "Content-Type": "text/html; charset=utf-8" }, body);
}
function json(response: ServerResponse, status: number, headers: Record<string, string>, value: unknown): void {
  send(response, status, { ...headers, "Content-Type": "application/json" }, JSON.stringify(value));
}

// readJSON reads a bounded JSON body; null for anything else. Only
// application/json is read: a form or a text/plain request of another site
// never reaches a write.
async function readJSON(request: IncomingMessage): Promise<unknown> {
  if ((request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() !== "application/json") return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > maxBody) return null;
    chunks.push(chunk as Buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; } catch { return null; }
}

// readFields reads a JSON object whose keys are among allowed, the first
// required; null otherwise.
async function readFields(request: IncomingMessage, allowed: string[]): Promise<Record<string, unknown> | null> {
  const body = await readJSON(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  return keys.includes(allowed[0]!) && keys.every(k => allowed.includes(k)) ? body as Record<string, unknown> : null;
}

// readBody reads a bounded body as it is; null beyond the bound.
async function readBody(request: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > maxFile) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

// canWrite is the tool's own rule: editors write, and so do whoever
// administers the Chest or builds the tool; readers read.
export function canWrite(who: Member): boolean {
  return who.role === "editor" || who.isAdmin || who.isBuilder;
}

// createApp returns the request handler of the tool, with its notes, its
// database, its files, its team, what it is told of its members' lifecycle,
// what it does by itself, its AI, its secrets and its chat.
export function createApp(notes: NoteStore, database: Database, files: Files, members: Team, lifecycle: Lifecycle, schedules: Schedules, assistant: Assistant, secrets: Secrets, chat: Chat): (request: IncomingMessage, response: ServerResponse) => void {
  // chestView is the Chest as the tool is told it (the chest module) and as
  // its database's sessions are in it.
  async function chestView(): Promise<ChestView> {
    return { organization: chest.organization.name, timeZone: chest.timeZone, currency: chest.currency, teamUrl: chest.tool.teamUrl, publicUrl: chest.tool.publicUrl, today: chest.today(), database: await database.session() };
  }
  async function teamRoute(request: IncomingMessage, response: ServerResponse, path: string, query: string): Promise<void> {
    // /chest and below: the Chest's team host asserts the member. Without a
    // valid assertion — the public host never sends one —, nobody.
    const who = member(request);
    if (!who) return request.method === "GET" && (path === "/chest" || path === "/chest/") ? html(response, 401, team, errorPage("Sign-in required", "This part is for the members of the team.")) : json(response, 401, team, { error: "member_required" });
    const method = request.method ?? "";
    if (path === "/chest" || path === "/chest/") {
      if (method !== "GET" && method !== "HEAD") return json(response, 405, { ...team, Allow: "GET, HEAD" }, { error: "method_not_allowed" });
      // The variable the manifest expects (env), as the Chest gave it at start.
      return html(response, 200, team, teamPage(version, who.name, who.role, await chestView(), who.language, who.timeZone, canWrite(who), process.env["TESTWEB_GREETING"]));
    }
    // What the proofs read of the Chest, as the tool and its database see it.
    if (path === "/chest/api/chest") {
      if (method !== "GET") return json(response, 405, { ...team, Allow: "GET" }, { error: "method_not_allowed" });
      return json(response, 200, team, { ...(await chestView()), language: chest.language });
    }
    if (path === "/chest/app.js") {
      if (method !== "GET" && method !== "HEAD") return json(response, 405, { ...team, Allow: "GET, HEAD" }, { error: "method_not_allowed" });
      return send(response, 200, { ...team, "Content-Type": "text/javascript; charset=utf-8" }, script);
    }
    if (path === "/chest/api/notes") {
      if (method === "GET") return json(response, 200, team, { notes: await notes.list(), canWrite: canWrite(who) });
      if (method !== "POST") return json(response, 405, { ...team, Allow: "GET, POST" }, { error: "method_not_allowed" });
      if (!canWrite(who)) return json(response, 403, team, { error: "read_only" });
      const body = await readJSON(request);
      const text = body !== null && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 1 ? noteText((body as Record<string, unknown>)["text"]) : null;
      if (text === null) return json(response, 400, team, { error: "invalid_note" });
      const note = await notes.add(text, who.id);
      if (!note) return json(response, 409, team, { error: "full" });
      // Told to the other tools that receive notes once kept; the note is
      // the tool's either way.
      try {
        await lifecycle.tell(note);
      } catch (error) {
        console.error("testweb: note.added not told:", error instanceof ChestError ? error.code : "unavailable");
      }
      return json(response, 201, team, note);
    }
    const removal = /^\/chest\/api\/notes\/([1-9][0-9]{0,9})$/u.exec(path);
    if (removal) {
      if (method !== "DELETE") return json(response, 405, { ...team, Allow: "DELETE" }, { error: "method_not_allowed" });
      if (!canWrite(who)) return json(response, 403, team, { error: "read_only" });
      return await notes.remove(Number(removal[1])) ? send(response, 204, team) : json(response, 404, team, { error: "unknown_note" });
    }
    // What the proofs read of the database: the migrations played, the
    // columns of the notes.
    if (path === "/chest/api/database") {
      if (method !== "GET") return json(response, 405, { ...team, Allow: "GET" }, { error: "method_not_allowed" });
      return json(response, 200, team, await database.schema());
    }
    if (path === "/chest/chat" || path === "/chest/chat.js" || path === "/chest/realtime-client.js" || path.startsWith("/chest/api/chat/")) return chatRoute(request, response, path, query, who);
    if (path === "/chest/api/files" || path.startsWith("/chest/api/files/")) return filesRoute(request, response, path, who);
    if (path === "/chest/api/secrets") return secretsRoute(request, response, who);
    if (path === "/chest/api/notify" || path === "/chest/api/broadcast" || path === "/chest/api/withdraw" || path === "/chest/api/badge") return notifyRoute(request, response, path, who);
    if (path === "/chest/members" || path === "/chest/api/me" || path === "/chest/api/members" || path.startsWith("/chest/api/members/") || path === "/chest/api/groups") return membersRoute(request, response, path, query, who);
    // A summary by the Chest's AI, for any member: {text, stream?} → {text,
    // model, cost}, or {paused: reason} while the Chest pauses AI.
    if (path === "/chest/api/summary") {
      if (method !== "POST") return json(response, 405, { ...team, Allow: "POST" }, { error: "method_not_allowed" });
      const body = await readFields(request, ["text", "stream"]);
      const text = body?.["text"], stream = body?.["stream"] ?? false;
      if (typeof text !== "string" || text.length < 1 || text.length > 2000 || typeof stream !== "boolean") return json(response, 400, team, { error: "invalid_body" });
      try {
        return json(response, 200, team, await assistant.summarise(text, who.id, stream));
      } catch (error) {
        if (error instanceof ChestError) return json(response, error.status, team, { error: error.code });
        throw error;
      }
    }
    if (path === "/chest/api/events") {
      if (method !== "GET") return json(response, 405, { ...team, Allow: "GET" }, { error: "method_not_allowed" });
      return json(response, 200, team, lifecycle.view());
    }
    if (path === "/chest/api/schedules") {
      if (method !== "GET") return json(response, 405, { ...team, Allow: "GET" }, { error: "method_not_allowed" });
      return json(response, 200, team, schedules.view());
    }
    if (path === "/chest/api/events/hold") {
      if (method !== "POST") return json(response, 405, { ...team, Allow: "POST" }, { error: "method_not_allowed" });
      if (!canWrite(who)) return json(response, 403, team, { error: "read_only" });
      const held = (await readFields(request, ["held"]))?.["held"];
      if (typeof held !== "boolean") return json(response, 400, team, { error: "invalid_body" });
      lifecycle.hold(held);
      return send(response, 204, team);
    }
    if (path === "/chest/api/quota-probe") {
      if (method !== "POST") return json(response, 405, { ...team, Allow: "POST" }, { error: "method_not_allowed" });
      if (!canWrite(who)) return json(response, 403, team, { error: "read_only" });
      return json(response, 200, team, await files.quotaProbe());
    }
    return json(response, 404, team, { error: "not_found" });
  }
  // The files of the team, kept by the Chest: listed, read (base64, never
  // served as they are from this origin), described, put and removed by who
  // writes; a link of the Chest to one of them, or to its thumbnail, for
  // any member; an upload authorised to the browser of who writes, into
  // photos/ (images, 10 MiB) or under the name it asks. The Chest's
  // refusals say their code and status.
  // The chat: its page and its scripts, the rooms a member joins and
  // leaves, their messages — a member reads and writes only the rooms they
  // are in —, who is present in the lobby. The tool writes rows; the Chest
  // tells the pages (realtime).
  async function chatRoute(request: IncomingMessage, response: ServerResponse, path: string, query: string, who: Member): Promise<void> {
    const method = request.method ?? "";
    const scripts: Record<string, Buffer | string> = { "/chest/chat.js": chatScript, "/chest/realtime-client.js": realtimeClient };
    if (path === "/chest/chat" || scripts[path] !== undefined) {
      if (method !== "GET" && method !== "HEAD") return json(response, 405, { ...team, Allow: "GET, HEAD" }, { error: "method_not_allowed" });
      if (path === "/chest/chat") return html(response, 200, team, chatPage(who.name, who.id));
      return send(response, 200, { ...team, "Content-Type": "text/javascript; charset=utf-8" }, scripts[path]!);
    }
    if (path === "/chest/api/chat/presence") {
      if (method !== "GET") return json(response, 405, { ...team, Allow: "GET" }, { error: "method_not_allowed" });
      return json(response, 200, team, await realtime.presence("lobby"));
    }
    const route = /^\/chest\/api\/chat\/rooms\/([1-9][0-9]{0,5})\/(join|leave|messages)$/u.exec(path);
    if (!route) return json(response, 404, team, { error: "not_found" });
    const room = Number(route[1]), action = route[2];
    if (action === "messages" && method === "GET") {
      const after = new URLSearchParams(query).get("after") ?? "0";
      if (!/^(0|[1-9][0-9]{0,9})$/u.test(after)) return json(response, 400, team, { error: "invalid_query" });
      const listed = await chat.messages(room, who.id, Number(after));
      return listed ? json(response, 200, team, { messages: listed }) : json(response, 403, team, { error: "not_in_room" });
    }
    if (method !== "POST") return json(response, 405, { ...team, Allow: action === "messages" ? "GET, POST" : "POST" }, { error: "method_not_allowed" });
    if (action === "join") {
      await chat.join(room, who.id);
      return send(response, 204, team);
    }
    if (action === "leave") {
      await chat.leave(room, who.id);
      return send(response, 204, team);
    }
    const body = await readFields(request, ["text"]);
    const text = body ? chatText(body["text"]) : null;
    if (text === null) return json(response, 400, team, { error: "invalid_message" });
    const message = await chat.post(room, who.id, text);
    if (!message) return json(response, 403, team, { error: "not_in_room" });
    // The row's feed tells the room's pages; those not online would be
    // notified, those online but not on the room given an unread count —
    // the bench says who they are.
    const { online, watching } = await realtime.online(await chat.members(room), { channel: `room:${room}` });
    return json(response, 201, team, { message, online, watching });
  }

  async function filesRoute(request: IncomingMessage, response: ServerResponse, path: string, who: Member): Promise<void> {
    const method = request.method ?? "";
    try {
      if (path === "/chest/api/files") {
        if (method !== "GET") return json(response, 405, { ...team, Allow: "GET" }, { error: "method_not_allowed" });
        return json(response, 200, team, await files.list());
      }
      if (path === "/chest/api/files/url" && method === "POST") {
        const body = await readFields(request, ["name", "thumbnail"]);
        const name = body?.["name"], thumbnail = body?.["thumbnail"];
        if (typeof name !== "string" || (thumbnail !== undefined && thumbnail !== 256 && thumbnail !== 1024)) return json(response, 400, team, { error: "invalid_body" });
        return json(response, 200, team, await files.url(name, thumbnail === undefined ? {} : { thumbnail }));
      }
      if (path === "/chest/api/files/stat" && method === "POST") {
        const name = (await readFields(request, ["name"]))?.["name"];
        if (typeof name !== "string") return json(response, 400, team, { error: "invalid_body" });
        const object = await files.stat(name);
        return object ? json(response, 200, team, object) : json(response, 404, team, { error: "not_found" });
      }
      if (path === "/chest/api/files/upload-url" && method === "POST") {
        if (!canWrite(who)) return json(response, 403, team, { error: "read_only" });
        const body = await readFields(request, ["name", "expiresIn"]);
        const name = body?.["name"], expiresIn = body?.["expiresIn"];
        if (typeof name !== "string" || (expiresIn !== undefined && typeof expiresIn !== "number")) return json(response, 400, team, { error: "invalid_body" });
        const photos = name === "photos/";
        return json(response, 200, team, await files.uploadUrl(name, { ...(photos ? { types: ["image/*"], maxSize: 10 << 20 } : {}), ...(expiresIn !== undefined ? { expiresIn } : {}) }));
      }
      const name = path.slice("/chest/api/files/".length);
      if (method === "GET") {
        const file = await files.get(name);
        return file ? json(response, 200, team, { name, type: file.type, size: file.size, data: Buffer.from(file.data).toString("base64") }) : json(response, 404, team, { error: "not_found" });
      }
      if (method !== "PUT" && method !== "DELETE") return json(response, 405, { ...team, Allow: "GET, PUT, DELETE" }, { error: "method_not_allowed" });
      if (!canWrite(who)) return json(response, 403, team, { error: "read_only" });
      if (method === "DELETE") return await files.remove(name) ? send(response, 204, team) : json(response, 404, team, { error: "not_found" });
      const body = await readBody(request);
      if (body === null) return json(response, 413, team, { error: "too_large" });
      return json(response, 201, team, await files.put(name, body, request.headers["content-type"] ?? "application/octet-stream"));
    } catch (error) {
      if (error instanceof ChestError) return json(response, error.status, team, { error: error.code });
      throw error;
    }
  }
  // The secrets of the team: read by any member — each value opened for
  // them by the Chest, or null when it is the editors' and they are not —,
  // added by who writes, sealed for the editors when asked. The Chest's
  // refusals say their code and status.
  async function secretsRoute(request: IncomingMessage, response: ServerResponse, who: Member): Promise<void> {
    const method = request.method ?? "";
    try {
      if (method === "GET") return json(response, 200, team, { secrets: await secrets.list(request) });
      if (method !== "POST") return json(response, 405, { ...team, Allow: "GET, POST" }, { error: "method_not_allowed" });
      if (!canWrite(who)) return json(response, 403, team, { error: "read_only" });
      const body = await readFields(request, ["label", "value", "editors"]);
      const label = secretLabel(body?.["label"]), value = body?.["value"], editors = body?.["editors"] ?? false;
      if (label === null || typeof value !== "string" || value.length < 1 || value.length > maxValue || typeof editors !== "boolean") return json(response, 400, team, { error: "invalid_body" });
      const added = await secrets.add(label, value, editors);
      return added ? json(response, 201, team, added) : json(response, 409, team, { error: "taken_or_full" });
    } catch (error) {
      if (error instanceof ChestError) return json(response, error.status, team, { error: error.code });
      throw error;
    }
  }
  // The team, read from the Chest: the members' page for any member, and
  // what the laboratory's proof reads — the member the Chest asserts, the
  // members listed (a search, a cursor), one by identifier, a lookup, the
  // groups. The Chest's refusals say their code and status.
  async function membersRoute(request: IncomingMessage, response: ServerResponse, path: string, query: string, who: Member): Promise<void> {
    const method = request.method ?? "";
    if (path === "/chest/api/members/lookup") {
      if (method !== "POST") return json(response, 405, { ...team, Allow: "POST" }, { error: "method_not_allowed" });
    } else if (method !== "GET") return json(response, 405, { ...team, Allow: "GET" }, { error: "method_not_allowed" });
    try {
      if (path === "/chest/api/me") return json(response, 200, team, { member: who });
      if (path === "/chest/api/groups") {
        const groups: Group[] = [];
        let after: string | undefined;
        do {
          const page = await members.groups(after);
          groups.push(...page.groups);
          after = page.next ?? undefined;
        } while (after !== undefined);
        return json(response, 200, team, { groups });
      }
      if (path === "/chest/members") {
        const everyone: Member[] = [];
        let after: string | undefined;
        do {
          const page = await members.list(after === undefined ? {} : { after });
          everyone.push(...page.members);
          after = page.next ?? undefined;
        } while (after !== undefined);
        return html(response, 200, team, membersPage(everyone));
      }
      if (path === "/chest/api/members") {
        const params = new URLSearchParams(query);
        if ([...params.keys()].some(key => key !== "q" && key !== "after")) return json(response, 400, team, { error: "invalid_query" });
        const q = params.get("q"), after = params.get("after");
        return json(response, 200, team, await members.list({ ...(q === null ? {} : { q }), ...(after === null ? {} : { after }) }));
      }
      if (path === "/chest/api/members/lookup") {
        const body = await readJSON(request);
        const ids = body !== null && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 1 ? (body as Record<string, unknown>)["ids"] : undefined;
        if (!Array.isArray(ids) || !ids.every(id => typeof id === "string")) return json(response, 400, team, { error: "invalid_body" });
        return json(response, 200, team, await members.lookup(ids as string[]));
      }
      const found = await members.get(path.slice("/chest/api/members/".length));
      return found ? json(response, 200, team, found) : json(response, 404, team, { error: "not_found" });
    } catch (error) {
      if (error instanceof ChestError) return json(response, error.status, team, { error: error.code });
      throw error;
    }
  }
  // What the tool tells the members, through the Chest, for who writes: an
  // item of their inbox (notify: the members named, a title, a body, the
  // page it opens, its key and its words in other languages; broadcast:
  // the same to everyone who has the tool, or to groups or roles, the writer
  // left out), withdrawn by its key, the counter of the tile of one of them.
  // The Chest's refusals say their code and status.
  async function notifyRoute(request: IncomingMessage, response: ServerResponse, path: string, who: Member): Promise<void> {
    if (request.method !== "POST") return json(response, 405, { ...team, Allow: "POST" }, { error: "method_not_allowed" });
    if (!canWrite(who)) return json(response, 403, team, { error: "read_only" });
    const notice = ["title", "body", "path", "key", "translations"];
    const body = await readFields(request, path === "/chest/api/notify" ? ["members", ...notice] : path === "/chest/api/broadcast" ? ["groups", "roles", ...notice] : path === "/chest/api/withdraw" ? ["key", "members"] : ["member", "count"]);
    const ids = body?.["members"];
    if (body === null || (ids !== undefined && (!Array.isArray(ids) || !ids.every(id => typeof id === "string")))) return json(response, 400, team, { error: "invalid_body" });
    const text = (key: string) => typeof body[key] === "string" ? body[key] as string : undefined;
    try {
      if (path === "/chest/api/notify" || path === "/chest/api/broadcast") {
        const title = text("title"), more = text("body"), page = text("path"), key = text("key"), translations = body["translations"];
        const lists = (name: string) => body[name] === undefined || (Array.isArray(body[name]) && (body[name] as unknown[]).every(v => typeof v === "string"));
        if (title === undefined || !lists("groups") || !lists("roles") || (translations !== undefined && (translations === null || typeof translations !== "object" || Array.isArray(translations)))) return json(response, 400, team, { error: "invalid_body" });
        const said: Notice = { title, ...(more === undefined ? {} : { body: more }), ...(page === undefined ? {} : { path: page }), ...(key === undefined ? {} : { key }), ...(translations === undefined ? {} : { translations: translations as NonNullable<Notice["translations"]> }) };
        if (path === "/chest/api/notify") return ids ? json(response, 200, team, await members.notify(ids as string[], said)) : json(response, 400, team, { error: "invalid_body" });
        const groups = body["groups"] as string[] | undefined, roles = body["roles"] as string[] | undefined;
        await members.broadcast(said, { ...(groups || roles ? { to: { ...(groups ? { groups } : {}), ...(roles ? { roles } : {}) } } : {}), except: [who.id] });
        return send(response, 204, team);
      }
      if (path === "/chest/api/withdraw") {
        const key = text("key");
        if (key === undefined) return json(response, 400, team, { error: "invalid_body" });
        await members.withdraw(key, ids as string[] | undefined);
        return send(response, 204, team);
      }
      const id = text("member"), count = body["count"];
      if (id === undefined || typeof count !== "number") return json(response, 400, team, { error: "invalid_body" });
      return json(response, 200, team, { set: await members.badge(id, count) });
    } catch (error) {
      if (error instanceof ChestError) return json(response, error.status, team, { error: error.code });
      throw error;
    }
  }
  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    // The Chest forwards only paths in their simple form; the query is read
    // by the routes that take one.
    const [path = "/", query = ""] = (request.url ?? "/").split("?", 2);
    if (path === "/chest-events") {
      // The Chest's events, through the launcher only: the SDK verifies them.
      if (request.method !== "POST") return json(response, 405, { ...common, Allow: "POST" }, { error: "method_not_allowed" });
      return send(response, await lifecycle.receive(request), common);
    }
    if (path === "/chest-schedules") {
      // The runs of its schedules, through the launcher only: the SDK verifies them.
      if (request.method !== "POST") return json(response, 405, { ...common, Allow: "POST" }, { error: "method_not_allowed" });
      return send(response, await schedules.receive(request), common);
    }
    if (path === "/chest/api/egress") return egressRoute(request, response, query);
    if (path === "/chest/api/db-probe") return probeRoute(request, response, query);
    if (path === "/chest" || path.startsWith("/chest/")) return teamRoute(request, response, path, query);
    if (path === "/api/apply/upload-url" || path === "/api/apply") return applyRoute(request, response, path);
    const method = request.method ?? "";
    if (method !== "GET" && method !== "HEAD") return json(response, 405, { ...common, Allow: "GET, HEAD" }, { error: "method_not_allowed" });
    if (path === "/") return html(response, 200, common, publicPage(version, chest.tool.publicUrl));
    // Who the tool sees here: on the public host, nobody, whatever a client sends.
    if (path === "/api/whoami") return json(response, 200, { ...common, "Cache-Control": "no-store" }, { member: member(request) });
    if (path === "/static/site.css") return send(response, 200, { ...common, "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=300" }, stylesheet);
    // A visitor's form, embeddable in the company's website.
    if (path === "/apply") return html(response, 200, common, applyPage());
    if (path === "/apply.js") return send(response, 200, { ...common, "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" }, applyScript);
    return html(response, 404, common, errorPage("Page not found", "This address matches no page."));
  }
  // A visitor's CV, on the public part: one upload authorised into
  // applications/ (a PDF, recognised by the Chest by its content), then the
  // name the Chest answered given back, which the tool stats before it
  // takes it. The visitor never reads a file: only the members do.
  async function applyRoute(request: IncomingMessage, response: ServerResponse, path: string): Promise<void> {
    if (request.method !== "POST") return json(response, 405, { ...common, Allow: "POST" }, { error: "method_not_allowed" });
    const headers = { ...common, "Cache-Control": "no-store" };
    try {
      if (path === "/api/apply/upload-url") {
        if (await readJSON(request) === null) return json(response, 400, headers, { error: "invalid_body" });
        return json(response, 200, headers, await files.uploadUrl(applications, { public: true, types: ["application/pdf"], maxSize: 1 << 20 }));
      }
      const name = (await readFields(request, ["name"]))?.["name"];
      if (typeof name !== "string" || !name.startsWith(applications)) return json(response, 400, headers, { error: "invalid_body" });
      const object = await files.stat(name);
      return object ? json(response, 200, headers, { received: object.name, type: object.type, size: object.size }) : json(response, 404, headers, { error: "not_found" });
    } catch (error) {
      if (error instanceof ChestError) return json(response, error.status, headers, { error: error.code });
      throw error;
    }
  }
  // /chest/api/egress?target=<one of egressTargets>: a member has the tool
  // try its outbound network — the laboratory's proof reads the answer.
  async function egressRoute(request: IncomingMessage, response: ServerResponse, query: string): Promise<void> {
    if (!member(request)) return json(response, 401, team, { error: "member_required" });
    if (request.method !== "GET") return json(response, 405, { ...team, Allow: "GET" }, { error: "method_not_allowed" });
    const params = new URLSearchParams(query);
    const target = params.get("target");
    if ([...params.keys()].length !== 1 || !egressTargets.includes(target as EgressTarget)) return json(response, 400, team, { error: "invalid_target" });
    return json(response, 200, team, await egress(target as EgressTarget));
  }
  // /chest/api/db-probe?target=<one of probeTargets>: a member has the tool
  // try to reach what it must not — the laboratory's proof reads the answer.
  async function probeRoute(request: IncomingMessage, response: ServerResponse, query: string): Promise<void> {
    if (!member(request)) return json(response, 401, team, { error: "member_required" });
    if (request.method !== "GET") return json(response, 405, { ...team, Allow: "GET" }, { error: "method_not_allowed" });
    const params = new URLSearchParams(query);
    const target = params.get("target");
    if ([...params.keys()].length !== 1 || !probeTargets.includes(target as ProbeTarget)) return json(response, 400, team, { error: "invalid_target" });
    return json(response, 200, team, await database.probe(target as ProbeTarget));
  }
  return (request, response) => {
    route(request, response).catch(() => {
      if (!response.headersSent) json(response, 500, common, { error: "internal" });
      else response.destroy();
    });
  };
}
