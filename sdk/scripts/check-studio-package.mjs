// The studio's package check (0.4.1-studio.N): 0.4.1's scripts/check-package.mjs
// (beside this file, verbatim; it also packs check/, which the studio's
// copy does not hold), for the package the studio packs: npm pack, install
// the tarball into a throwaway project, then import every subpath from
// plain Node ESM, through a bundler (esbuild, as Next.js and others consume
// it) and through a Vite SSR build (the stack of the Perseus starter), run
// what each gives on a fake Chest, and type-check a TypeScript consumer
// under moduleResolution bundler and nodenext. Nothing assumes Next.js.
//
//   npm run check:package        (node scripts/check-studio-package.mjs)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const name = manifest.name;

// What each subpath gives at run time (tool contract 0.4); the root gives
// them all, files, members, notifications, events, schedules and ai as
// namespaces, never testing. 0.4.1-studio: 0.4.1's names, then the studio's
// proposals — the names they add to an official module, and their own
// modules (mail, calendar, webhooks, visitors, checks), namespaces at the
// root too.
const official = {
  errors: ["AiCapReached", "AiModelNotAllowed", "AiRefused", "AiUnavailable", "CapabilityNotGranted", "ChestError", "QuotaExceeded", "RateLimited", "TooLarge", "Unavailable"],
  member: ["groupIdPattern", "languagePattern", "member", "memberIdPattern", "timeZonePattern"],
  chest: ["chest"],
  database: ["databaseUrl"],
  files: ["delete", "get", "list", "move", "put", "stat", "uploadUrl", "url"],
  members: ["forget", "get", "groups", "list", "lookup"],
  notifications: ["badge", "notify", "withdraw"],
  events: ["acknowledgeErasure", "erasureIdPattern", "handle", "memorySeen", "verify"],
  schedules: ["handle", "verify"],
  ai: ["chat", "embed", "models", "usage"],
  testing: ["fakeChest", "signAssertion", "withMember"],
};
const studio = {
  member: ["localeOf", "locales", "maxAssertionLength"],
  chest: ["forgetTheme", "readThemeChoice", "readToolUrls", "themeIdPattern", "toolNamePattern"],
  files: ["claim", "publicLimits", "publicPath", "publicUploadUrl"],
  members: ["leftAt", "matchEmails", "matchLimits"],
  notifications: ["broadcast"],
  testing: ["shownTo"],
  events: ["occurredAtOf", "occurredLimits", "publish", "receivers", "toolEventPattern"],
  mail: ["available", "idempotencyKey", "isAddress", "limits", "messageIdPattern", "send", "status"],
  calendar: ["ics", "keyPattern", "limits", "list", "pick", "put", "putMany", "remove", "uidOf"],
  webhooks: ["add", "available", "checkUrl", "deliveryIdPattern", "enable", "eventIdPattern", "handle", "journal", "keyPattern", "limits", "list", "remove", "rotateSecret", "send", "targetIdPattern", "verify", "webhookEventPattern"],
  visitors: ["address", "addressHeader", "checkForm", "count", "formToken", "language", "visitor"],
  checks: ["checkIdPattern", "checkPattern", "configure", "handle", "limits", "list", "verify"],
};
const expected = Object.fromEntries([...new Set([...Object.keys(official), ...Object.keys(studio)])].map(sub => [sub, [...(official[sub] ?? []), ...(studio[sub] ?? [])].sort()]));
const namespaces = ["files", "members", "notifications", "events", "schedules", "ai", "mail", "calendar", "webhooks", "visitors", "checks"];
const rootExports = [...Object.entries(expected).filter(([sub]) => !namespaces.includes(sub) && sub !== "testing").flatMap(([, names]) => names), ...namespaces].sort();

const subpaths = Object.keys(manifest.exports).filter(key => key !== "./package.json");
assert.deepEqual(subpaths.sort(), [".", ...Object.keys(expected).map(sub => "./" + sub)].sort(), "the exports map and this check name the same subpaths");

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// Run from prepublishOnly, npm passes its own flags down: a dry run would
// keep npm pack from writing the tarball this check installs.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "npm_config_dry_run"));
function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}
function step(title) {
  console.log(`\n== ${title}`);
}

const work = mkdtempSync(join(tmpdir(), "chest-sdk-check-"));
try {
  step("npm pack");
  const [packed] = JSON.parse(run(npm, ["pack", "--json", "--pack-destination", work], root).replace(/^[^[]*/su, ""));
  const tarball = join(work, packed.filename);
  const shipped = packed.files.map(file => file.path).sort();
  console.log(`${packed.filename}: ${shipped.length} files, ${packed.size} bytes`);
  for (const path of shipped) console.log("  " + path);
  for (const path of shipped) {
    assert.ok(/^(package\.json|README\.md|LICENSE|dist\/(src|studio)\/[a-z-]+\.(js|d\.ts)(\.map)?|client\/(src|studio)\/[a-z-]+\.ts)$/u.test(path), `unexpected file in the package: ${path}`);
  }
  // The runtime client stays small: 0.4.1 holds itself under 200 KiB; the
  // proposals (mail, calendar, webhooks, the fakes) about double it.
  assert.ok(packed.size < 400 * 1024, `${name} packs ${packed.size} bytes: the runtime client must stay small`);
  for (const target of Object.values(manifest.exports).flatMap(entry => typeof entry === "string" ? [entry] : Object.values(entry))) {
    assert.ok(shipped.includes(target.slice(2)), `export target missing from the package: ${target}`);
  }

  step("install the tarball into a throwaway project");
  const consumer = join(work, "consumer");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }) + "\n");
  run(npm, ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--no-package-lock", tarball], consumer);
  console.log(`installed ${name} in ${consumer}`);

  // The same probe runs from Node and from the bundle: every subpath, its
  // names, a class shared between subpaths and the root, and two calls that
  // need no Chest.
  const specifiers = subpaths.map(sub => sub === "." ? name : name + sub.slice(1));
  const probe = [
    ...specifiers.map((specifier, i) => `import * as m${i} from ${JSON.stringify(specifier)};`),
    `const modules = { ${specifiers.map((specifier, i) => `${JSON.stringify(specifier)}: m${i}`).join(", ")} };`,
    `const names = {};`,
    `for (const [specifier, module] of Object.entries(modules)) names[specifier] = Object.keys(module).sort();`,
    `const root = modules[${JSON.stringify(name)}];`,
    `const errors = modules[${JSON.stringify(name + "/errors")}];`,
    `const database = modules[${JSON.stringify(name + "/database")}];`,
    `delete process.env.DATABASE_URL; delete process.env.CHEST_TOKEN;`,
    `let refused = false;`,
    `try { database.databaseUrl(); } catch (error) { refused = error instanceof errors.CapabilityNotGranted && error instanceof root.ChestError; }`,
    `const nobody = modules[${JSON.stringify(name + "/member")}].member(new Request("http://tool.test/chest", { headers: { "chest-member": "a.b.c" } }));`,
    `const testing = modules[${JSON.stringify(name + "/testing")}];`,
    `const chest = await testing.fakeChest({ members: [{ id: "mbr_" + "a".repeat(26), firstName: "Ada", lastName: "L", name: "Ada L", photo: null, role: null, isAdmin: false, isBuilder: false, groups: [], language: "en", timeZone: "Europe/Paris" }] });`,
    `const listed = (await root.members.list()).members.map(m => m.name);`,
    `const delivered = (await root.notifications.notify([chest.members[0].id], { title: "Hello" })).delivered;`,
    `const kept = chest.notifications.map(n => n.title);`,
    `const signed = modules[${JSON.stringify(name + "/member")}].member(testing.withMember(new Request("http://tool.test/chest"), chest.members[0]))?.id;`,
    `const told = [];`,
    `const said = (await root.ai.chat({ model: "default", messages: [{ role: "user", content: "Hi" }] })).text;`,
    `let streamed = "";`,
    `for await (const piece of modules[${JSON.stringify(name + "/ai")}].chat({ model: "fast", messages: [{ role: "user", content: "Hi there" }], stream: true })) streamed += piece.text;`,
    `const calls = chest.ai.map(c => c.path);`,
    `const studio = [root.chest.currency, root.chest.tool.teamUrl, root.chest.tools.get("forms"), (await root.chest.theme()).mode, root.localeOf(chest.members[0].language), await root.mail.send({ to: "a@example.com", subject: "x", text: "" }).catch(e => e.code)];`,
    `const ran = await chest.run("morning", request => root.schedules.handle(request, { morning: () => {} }).then(status => new Response(null, { status })));`,
    `const answered = await chest.emit({ type: "access.revoked", data: { id: chest.members[0].id } }, request => root.events.handle(request, { "access.revoked": e => { told.push(e.data.id); } }).then(status => new Response(null, { status })));`,
    `await chest.close();`,
    `console.log(JSON.stringify({ names, sameClass: root.ChestError === errors.ChestError, sameFiles: root.files.put === modules[${JSON.stringify(name + "/files")}].put, sameMembers: root.members.list === modules[${JSON.stringify(name + "/members")}].list, sameAi: root.ai.chat === modules[${JSON.stringify(name + "/ai")}].chat, sameMail: root.mail.send === modules[${JSON.stringify(name + "/mail")}].send, sameOfficial: modules[${JSON.stringify(name + "/members")}].lookup === modules[${JSON.stringify(name + "/members")}].lookup && root.files.url === modules[${JSON.stringify(name + "/files")}].url, studio, ran, refused, nobody, listed, delivered, kept, signed, said, streamed, calls, answered, told }));`,
  ].join("\n") + "\n";
  function verify(output, how) {
    const result = JSON.parse(output);
    for (const [sub, names] of Object.entries(expected)) assert.deepEqual(result.names[`${name}/${sub}`], names, `${how}: ${name}/${sub}`);
    assert.deepEqual(result.names[name], rootExports, `${how}: ${name}`);
    assert.equal(result.sameClass, true, `${how}: one ChestError for the root and /errors`);
    assert.equal(result.sameFiles, true, `${how}: one files module for the root and /files`);
    assert.equal(result.refused, true, `${how}: databaseUrl() without DATABASE_URL throws CapabilityNotGranted`);
    assert.equal(result.nobody, null, `${how}: member() without CHEST_TOKEN is null`);
    assert.equal(result.sameMembers, true, `${how}: one members module for the root and /members`);
    assert.deepEqual(result.listed, ["Ada L"], `${how}: members listed from a fake Chest`);
    assert.deepEqual([result.delivered, result.kept], [["mbr_" + "a".repeat(26)], ["Hello"]], `${how}: a notification delivered by a fake Chest`);
    assert.equal(result.sameAi, true, `${how}: one ai module for the root and /ai`);
    assert.deepEqual([result.said, result.streamed, result.calls], ["Hi", "Hi there", ["/ai/chat", "/ai/chat"]], `${how}: a chat answered by a fake Chest, whole and streamed`);
    assert.equal(result.signed, "mbr_" + "a".repeat(26), `${how}: an assertion of the testing module reads as its member`);
    assert.equal(result.sameMail, true, `${how}: one mail module for the root and /mail (a studio proposal)`);
    assert.deepEqual(result.studio, ["EUR", "https://tool-chest.chest.test", null, "own", "en", "capability_not_granted"], `${how}: 0.4.1's chest members and the studio's on a fake Chest`);
    assert.equal(result.ran, 204, `${how}: a run of a schedule delivered by the fake Chest (0.4.1's)`);
    assert.equal(result.sameOfficial, true, `${how}: one module for each official subpath and the root`);
    assert.deepEqual([result.answered, result.told], [204, ["mbr_" + "a".repeat(26)]], `${how}: an event emitted by a fake Chest handled once`);
    for (const specifier of specifiers) console.log(`  ${specifier}: ${result.names[specifier].join(", ")}`);
  }

  step("import every subpath from Node");
  writeFileSync(join(consumer, "probe.mjs"), probe);
  verify(run(process.execPath, ["probe.mjs"], consumer), "Node");

  step("bundle every subpath with esbuild");
  const esbuild = await import(pathToFileURL(join(root, "node_modules", "esbuild", "lib", "main.js")).href);
  const bundled = await esbuild.build({
    absWorkingDir: consumer,
    entryPoints: ["probe.mjs"],
    outfile: "bundle.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    metafile: true,
    logLevel: "warning",
  });
  const inputs = Object.keys(bundled.metafile.inputs).filter(input => input.includes(name));
  assert.ok(inputs.length > 0 && inputs.every(input => /\/dist\/.+\.js$/u.test(input)), `the bundle resolves compiled JavaScript only: ${inputs.join(", ")}`);
  console.log(`resolved ${inputs.length} modules: ${inputs.map(input => input.slice(input.indexOf(name) + name.length + 1)).join(", ")}`);
  verify(run(process.execPath, ["bundle.mjs"], consumer), "esbuild bundle");

  step("build every subpath with Vite for the server (SSR), as the Perseus starter builds");
  // Vite of the Perseus starter's major version (reference/perseus-starter:
  // "vite": "^8.3.2"), installed in the throwaway project; the SDK bundled
  // into the server build (ssr.noExternal), node:* left to Node.
  run(npm, ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--no-package-lock", "vite@^8.3.2"], consumer);
  writeFileSync(join(consumer, "vite.config.mjs"), `export default { logLevel: "warn", build: { ssr: "probe.mjs", outDir: "vite-out", emptyOutDir: true, rollupOptions: { output: { format: "es", entryFileNames: "probe.mjs" } } }, ssr: { noExternal: [${JSON.stringify(name)}], target: "node" } };\n`);
  run(process.execPath, [join(consumer, "node_modules", "vite", "bin", "vite.js"), "build"], consumer);
  const viteBuilt = readFileSync(join(consumer, "vite-out", "probe.mjs"), "utf8");
  assert.ok(!viteBuilt.includes(`from "${name}`) && !viteBuilt.includes(`from '${name}`), "Vite bundled the SDK into the server build");
  verify(run(process.execPath, [join("vite-out", "probe.mjs")], consumer), "Vite SSR build");

  step("type-check a TypeScript consumer");
  writeFileSync(join(consumer, "consumer.ts"), `import type { IncomingMessage } from "node:http";
import * as sdk from "${name}";
import { AiCapReached, AiModelNotAllowed, AiRefused, AiUnavailable, CapabilityNotGranted, ChestError, QuotaExceeded, RateLimited, TooLarge, Unavailable, type AiUnavailableReason } from "${name}/errors";
import { member, type Member } from "${name}/member";
import { databaseUrl } from "${name}/database";
import * as files from "${name}/files";
import type { FileData, FileObject, FilePage } from "${name}/files";
import * as members from "${name}/members";
import { groups, type Group, type Lookup, type MemberPage } from "${name}/members";
import * as notifications from "${name}/notifications";
import type { Audience, BadgeCount, BadgeWrite, Delivery, Notice, Translations } from "${name}/notifications";
import * as events from "${name}/events";
import type { ChestEvent, Handlers, MemberErased, Seen } from "${name}/events";
import * as ai from "${name}/ai";
import type { AiModel, AiUsage, ChatChunk, ChatMessage, ChatResult, ChatTool, Embeddings } from "${name}/ai";
import { fakeChest, shownTo, signAssertion, withMember, type FakeAi, type FakeAiCall, type FakeChest, type FakeEvent, type FakeMember, type FakeNotification, type FakeRun } from "${name}/testing";
import type { Chest } from "${name}/chest";
import { chest, forgetTheme, type ThemeChoice } from "${name}/chest";
import { localeOf, type Locale } from "${name}/member";
import * as mail from "${name}/mail";
import * as schedules from "${name}/schedules";
import * as calendar from "${name}/calendar";
import * as webhooks from "${name}/webhooks";
import * as visitors from "${name}/visitors";
import * as checks from "${name}/checks";

export function who(request: Request | IncomingMessage): Member | null { return member(request); }
export const url: string = databaseUrl();
export async function keep(): Promise<[FileObject, FileData | null, FilePage, boolean, { url: string; expiresIn: number }]> {
  return [await files.put("a.txt", "a", "text/plain"), await files.get("a.txt"), await files.list({ prefix: "a" }), await files.delete("a.txt"), await sdk.files.url("a.txt")];
}
export async function team(): Promise<[MemberPage, Member | null, Lookup, Group[]]> {
  return [await members.list({ q: "a", limit: 10 }), await members.get("mbr_x"), await sdk.members.lookup(["mbr_x"]), await groups.list()];
}
export async function tell(ids: string[], notice: Notice, counts: BadgeCount[]): Promise<[Delivery, void, boolean, BadgeWrite]> {
  return [await notifications.notify(ids, notice), await sdk.notifications.withdraw("task:1", ids), await notifications.badge.set("mbr_x", 1), await notifications.badge.setMany(counts)];
}
export async function tellAll(ids: string[], translations: Translations): Promise<[Delivery, { delivered: number }]> {
  const audience: Audience = { to: { roles: ["reader"], groups: ["grp_x"] }, except: new Set(ids) };
  return [await notifications.notify(ids, { title: "Hello", translations }), await sdk.notifications.broadcast({ title: "Hello", path: "/chest", key: "k", translations: { fr: { title: "Bonjour" } } }, audience)];
}
export async function receive(request: Request, seen: Seen): Promise<[number, ChestEvent | null]> {
  const handlers: Handlers = { "member.erased": async (e: MemberErased) => { await events.acknowledgeErasure(e.data.erasure); }, "member.updated": e => { void e.data.changed; } };
  return [await events.handle(request, handlers, { seen }), await sdk.events.verify(request)];
}
export async function think(messages: ChatMessage[], tools: ChatTool[], signal: AbortSignal): Promise<[ChatResult, string, Embeddings, AiModel[], AiUsage]> {
  const result: ChatResult = await ai.chat({ model: "default", messages, tools, toolChoice: "auto", responseFormat: { type: "json_object" }, maxTokens: 800, signal });
  let text = "";
  for await (const piece of sdk.ai.chat({ model: "fast", messages, stream: true })) text += (piece satisfies ChatChunk).text + (piece.usage?.cost ?? 0);
  return [result, text, await ai.embed({ model: "embedding", input: ["a", "b"] }), await ai.models(), await ai.usage()];
}
export function paused(error: unknown): string | null {
  if (error instanceof AiCapReached) return error.scope + " until " + error.resetsAt.toISOString();
  if (error instanceof AiUnavailable) return error.reason satisfies AiUnavailableReason;
  return error instanceof AiModelNotAllowed || error instanceof AiRefused ? error.code : null;
}
export async function testAi(): Promise<FakeAiCall[]> {
  const options: FakeAi = { models: [{ alias: "default", model: "m" }], reply: request => ({ text: String(request["model"]), toolCalls: [{ name: "a", arguments: "{}" }] }), cap: 1, unavailable: "no_connector" };
  const chest = await fakeChest({ ai: options });
  await chest.close();
  return chest.ai;
}
export async function test(someone: Member): Promise<string> {
  const chest: FakeChest = await fakeChest({ members: [someone], capabilities: ["members", "notifications"] });
  const sent: FakeNotification[] = chest.notifications;
  const badges: Map<string, number> = chest.badges;
  const request: Request = withMember(new Request("http://tool.test/chest"), someone);
  const event: FakeEvent = { type: "member.erased", data: { id: someone.id, erasure: "era_" + "a".repeat(26), deadline: new Date().toISOString() } };
  await chest.emit(event, "http://127.0.0.1:1");
  const acknowledged: string[] = chest.acknowledged;
  await chest.close();
  return signAssertion(someone, { token: chest.token, tool: chest.tool }) + request.url + sent.length + badges.size + acknowledged.length;
}
export function where(): [Chest, string, string, string | null] { return [chest, chest.currency, new URL("/chest", chest.tool.teamUrl).href, chest.tool.publicUrl]; }
export async function studio(someone: Member, request: Request): Promise<[string, string, string | null, string | null, ThemeChoice, string, Locale, mail.Sent, mail.MailAvailability, string, number, unknown, unknown, Map<string, string>, number]> {
  const bare: FakeMember = { id: someone.id, firstName: "A", lastName: "B", name: "A B", photo: null, role: null, isAdmin: false, isBuilder: false, groups: [] };
  const fake = await fakeChest({ tool: "tasks", members: [bare], chest: { organization: "Acme SAS", currency: "CHF", publicUrl: null }, tools: { forms: true }, mail: { connected: false, replyTo: null } });
  const shown: string = shownTo(fake.notifications[0]!, "fr").title + (fake.notifications[0]?.translations?.fr?.title ?? "");
  fake.bounce("msg_x", { permanent: true });
  forgetTheme();
  const run: FakeRun = { attempt: 2 };
  const result: [string, string, string | null, string | null, ThemeChoice, string, Locale, mail.Sent, mail.MailAvailability, string, number, unknown, unknown, Map<string, string>, number] = [chest.organization.name + shown, chest.currency, chest.tools.get("forms")?.teamUrl ?? null, chest.tools.link("forms", "/chest"), await chest.theme(), chest.todayIn(someone.timeZone), localeOf(someone.language), await mail.send({ to: "a@example.com", subject: "x", text: "", replyTo: "b@example.com", attachments: [{ name: "a.ics", type: "text/calendar", content: "BEGIN" }] }), await mail.available(), visitors.language(request), (await sdk.members.groups.all()).length, calendar.limits, [webhooks.limits, checks.limits], await members.leftAt([someone.id]), await fake.run("morning", r => schedules.handle(r, { morning: () => {} }).then(status => new Response(null, { status })), run)];
  await fake.close();
  return result;
}
export function code(error: unknown): string | null {
  if (error instanceof CapabilityNotGranted || error instanceof QuotaExceeded || error instanceof RateLimited || error instanceof TooLarge || error instanceof Unavailable) return error.code;
  return error instanceof ChestError && error === (error satisfies sdk.ChestError) ? error.code : null;
}
`);
  const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
  for (const [resolution, module] of [["bundler", "esnext"], ["nodenext", "nodenext"]]) {
    const config = `tsconfig.${resolution}.json`;
    writeFileSync(join(consumer, config), JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module,
        moduleResolution: resolution,
        strict: true,
        exactOptionalPropertyTypes: true,
        noEmit: true,
        skipLibCheck: false,
        types: ["node"],
        typeRoots: [join(root, "node_modules", "@types")],
      },
      files: ["consumer.ts"],
    }, null, 2) + "\n");
    run(process.execPath, [tsc, "-p", config], consumer);
    console.log(`  moduleResolution ${resolution}: no error`);
  }

  console.log(`\n${name}@${manifest.version}: package check passed`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
