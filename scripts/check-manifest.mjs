// The studio's own checks of a tool folder, beside the Chest's: run
// `node scripts/chest-check.mjs <tool>` (0.7.0's `chest check`, the Chest's
// own code) for chest.json, the repository, the migrations — this script
// does not judge them again. It checks what chest check cannot know:
//
// - chest.proposals.json: the manifest keys of the SDK working copy's
//   proposals (sdk/, "Studio proposals"), which a Chest of contract 0.7
//   would refuse in chest.json (it refuses any key it does not know): mail
//   (to people outside, {"send": true} only), calendar, files
//   ({"publicFiles": true}), checks, webhooks, translations — their
//   grammar, and how they fit the chest.json beside them;
// - that chest.proposals.json no longer holds what 0.7.0 made official
//   (emits, receives, the capability "members.groups", files.publicUploads),
//   with the move to make;
// - that chest.json holds none of the proposals, is written for the
//   contract the studio builds on ("chest": "0.7"), and holds nothing the
//   studio dropped ("version", "group.*", files.quota);
// - the studio's rules beyond the contract: the package's scripts, no
//   dependency outside the folder, the docs every tool carries, no import
//   that leaves the folder.
//
//   node scripts/check-manifest.mjs tools/private/<name> [more folders…]
//   node scripts/check-manifest.mjs --all
//
// Exit code 1 when any folder has an error.
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The tool contract the studio's tools are written for: the SDK working
// copy's (sdk/contract, 0.7.0's bytes), which chest check applies.
const contract = JSON.parse(readFileSync(join(root, "sdk", "contract", "contract.json"), "utf8"));
const contractVersion = contract.contract.version ?? contract.contract;
// The keys the SDK working copy proposes for the manifest, and those of the
// tool contract 0.7, which belong in chest.json.
const proposalKeys = new Set(["mail", "files", "translations", "checks", "calendar", "webhooks"]);
// Keys the working copy proposed once and dropped, with the move to make.
const droppedKeys = {
  groups: '"groups": "read" is the capability "members.groups" of contract 0.7: write it in chest.json\'s "capabilities" (with "members")',
  mailboxes: 'mailboxes are gone: the Chest receives no mail (owner\'s decision, 2026-10-06) — replies from the public go to the company\'s address (Reply-To)',
  emits: '"emits" is official in contract 0.7: move it to chest.json as {"<type>": {"description", "data": {field: kind}}} — two to four dotted words of a-z, 0-9 and dashes (no underscore), each field typed (id, text, number, boolean, time, date, member, members, "?" for optional)',
  receives: '"receives" is official in contract 0.7: move the types to chest.json\'s "receives" (beside "member.*"); "group.*" is gone (joining or leaving a group is member.updated naming "groups")',
  capabilities: 'the capability "members.groups" is official in contract 0.7: move it to chest.json\'s "capabilities" (with "members")',
};
const officialKeys = new Set(contract.manifest.keys.map(k => k.key).filter(k => !k.includes(".")));
const studioDist = join(root, "sdk", "dist", "studio");
const load = async name => existsSync(join(studioDist, name)) ? import(pathToFileURL(join(studioDist, name)).href) : null;
const checksApi = await load("checks-rules.js");
const webhooksApi = await load("webhooks-rules.js");
const invisible = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]/u;

function walk(dir, visit, skip) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (skip(name, path)) continue;
    const stat = lstatSync(path);
    visit(path, stat);
    if (stat.isDirectory()) walk(path, visit, skip);
  }
}

export function checkTool(folder) {
  const errors = [];
  const warnings = [];
  const error = message => errors.push(message);
  const at = path => join(folder, path);

  if (!existsSync(at("chest.json"))) {
    error("chest.json is missing at the root (chest check says the rest)");
    return { errors, warnings };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(at("chest.json"), "utf8"));
  } catch (e) {
    error(`chest.json is not JSON: ${e.message} (chest check says the rest)`);
    return { errors, warnings };
  }
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    error("chest.json is not an object");
    return { errors, warnings };
  }
  // What only the studio knows about chest.json: where a proposal's key
  // goes, the contract the studio builds on, and what it dropped.
  for (const key of Object.keys(manifest)) {
    if (key === "version") error(`chest.json: "version" is the contract before 0.4 — write "chest": "${contractVersion}" instead`);
    else if (key === "groups") error(`chest.json: ${droppedKeys.groups}`);
    else if (proposalKeys.has(key) && !officialKeys.has(key)) error(`chest.json: "${key}" is a proposal of the SDK working copy — move it to chest.proposals.json (a ${contractVersion} Chest refuses a key it does not know)`);
  }
  if (manifest.chest !== undefined && manifest.chest !== contractVersion) error(`chest.json: "chest" is "${manifest.chest}" — the studio's tools are written for the contract of the SDK working copy: "chest": "${contractVersion}" (SDK ${contractVersion}.x)`);
  if (Array.isArray(manifest.receives) && manifest.receives.some(e => typeof e === "string" && e.startsWith("group."))) error('chest.json: receives "group.*" is no event of contract 0.7 — joining or leaving a group is member.updated naming "groups"');
  if (manifest.files !== undefined && manifest.files !== null && typeof manifest.files === "object") {
    if ("publicFiles" in manifest.files) error('chest.json: files.publicFiles is a proposal — move it to chest.proposals.json ("files": {"publicFiles": true}); 0.7\'s "files" is {"maxObject"}');
    if ("publicUploads" in manifest.files) error('chest.json: files.publicUploads is gone — a visitor\'s upload is 0.7.0\'s files.uploadUrl("folder/", {public: true, types}) with "public": true, no key');
    if ("quota" in manifest.files) error('chest.json: files.quota is gone in contract 0.7 (no quota: the tools share the server\'s volume) — keep "maxObject" only');
  }
  const roles = manifest.roles;

  if (existsSync(at("chest.proposals.json"))) {
    let proposals = null;
    try {
      proposals = JSON.parse(readFileSync(at("chest.proposals.json"), "utf8"));
    } catch (e) {
      error(`chest.proposals.json is not JSON: ${e.message}`);
    }
    if (proposals) {
      for (const key of Object.keys(proposals)) {
        // files is both: 0.7's (maxObject) in chest.json, the proposal's
        // (public files) here.
        if (proposalKeys.has(key)) continue;
        if (Object.hasOwn(droppedKeys, key)) error(`chest.proposals.json: ${droppedKeys[key]}`);
        else if (officialKeys.has(key)) error(`chest.proposals.json: "${key}" is a key of the tool contract ${contractVersion} — move it to chest.json`);
        else error(`chest.proposals.json: unknown proposal key "${key}"`);
      }
      // The calendar bridge: "calendar": true — “Adds events to the calendar of the members concerned”.
      if (proposals.calendar !== undefined && proposals.calendar !== true) error('chest.proposals.json: calendar is true');
      if (proposals.files !== undefined) {
        const f = proposals.files;
        if (f !== null && typeof f === "object" && !Array.isArray(f) && "publicUploads" in f) error('chest.proposals.json: files.publicUploads is gone — a visitor\'s upload is 0.7.0\'s files.uploadUrl("folder/", {public: true, types}); keep {"publicFiles": true} for files served on the public host');
        else if (f === null || typeof f !== "object" || Array.isArray(f) || Object.keys(f).some(k => k !== "publicFiles") || f.publicFiles !== true) error('chest.proposals.json: files is {"publicFiles": true}');
        else if (!(manifest.capabilities ?? []).includes("files")) error("chest.proposals.json: files needs the capability files");
        else if (manifest.public !== true) error("chest.proposals.json: public files need a public part");
      }
      // Mail to people outside the company: "mail": {"send": true} —
      // “Sends emails to people outside your company (customers,
      // candidates, visitors) through your company's mail provider”.
      if (proposals.mail !== undefined) {
        const m = proposals.mail;
        if (m !== null && typeof m === "object" && !Array.isArray(m) && "mailboxes" in m) error(`chest.proposals.json: mail.${droppedKeys.mailboxes}; mail is {"send": true}`);
        else if (m === null || typeof m !== "object" || Array.isArray(m) || Object.keys(m).some(k => k !== "send") || m.send !== true) error('chest.proposals.json: mail is {"send": true} (mail to people outside the company; members are told with notifications) — leave "mail" out when the tool sends none');
      }
      // The store's words in other languages: {"fr": {"title", "description",
      // "role_labels"}} — the tile and the admin's screens in each member's
      // language. The manifest's own words stay the English default.
      if (proposals.translations !== undefined) {
        const t = proposals.translations;
        const languages = ["fr"];
        if (t === null || typeof t !== "object" || Array.isArray(t)) error('chest.proposals.json: translations is {"fr": {"title", "description", "role_labels"}}');
        else for (const [lang, words] of Object.entries(t)) {
          if (!languages.includes(lang)) error(`chest.proposals.json: translations.${lang}: a language the Chest speaks (${languages.join(", ")})`);
          if (words === null || typeof words !== "object" || Array.isArray(words) || Object.keys(words).some(k => !["title", "description", "role_labels"].includes(k))) { error(`chest.proposals.json: translations.${lang} is {"title", "description", "role_labels"}`); continue; }
          for (const [key, max] of [["title", 48], ["description", 160]]) {
            const value = words[key];
            if (value === undefined) { warnings.push(`translations.${lang} has no ${key}: the English one is shown`); continue; }
            if (typeof value !== "string" || value.length === 0 || [...value].length > max || invisible.test(value)) error(`chest.proposals.json: translations.${lang}.${key} must be 1 to ${max} characters`);
          }
          const labels = words.role_labels;
          if (labels !== undefined) {
            if (labels === null || typeof labels !== "object" || Array.isArray(labels)) error(`chest.proposals.json: translations.${lang}.role_labels is an object`);
            else for (const [role, word] of Object.entries(labels)) {
              if (!Array.isArray(roles) || !roles.includes(role)) error(`chest.proposals.json: translations.${lang}.role_labels names "${role}", which roles does not declare`);
              if (typeof word !== "string" || word.length < 1 || [...word].length > 40 || word.trim() !== word || invisible.test(word)) error(`chest.proposals.json: translations.${lang}.role_labels.${role} must be 1 to 40 printable characters`);
            }
          }
          if (Array.isArray(roles) && manifest.role_labels && (!labels || roles.some(r => manifest.role_labels[r] && !labels[r]))) warnings.push(`translations.${lang}: some roles have no label in this language`);
        }
      }
      if (proposals.checks !== undefined) {
        if (!checksApi) warnings.push("checks not checked: build sdk/ first (npm run build)");
        else for (const problem of checksApi.checkManifest(proposals.checks)) error(`chest.proposals.json: ${problem}`);
      }
      // Webhooks: "webhooks": {"max": N} — “Sends notices to web addresses
      // your admins or subscribers give, signed by your Chest”.
      if (proposals.webhooks !== undefined) {
        if (!webhooksApi) warnings.push("webhooks not checked: build sdk/ first (npm run build)");
        else for (const problem of webhooksApi.checkManifest(proposals.webhooks)) error(`chest.proposals.json: ${problem}`);
      }
    }
  }

  // Studio rules beyond the contract.
  let pkg = null;
  try {
    pkg = JSON.parse(readFileSync(at("package.json"), "utf8"));
  } catch {
    // chest check says what is wrong with package.json.
  }
  if (pkg) {
    for (const s of ["dev", "build", "start", "test"]) if (!pkg.scripts?.[s]) error(`package.json has no "${s}" script (studio rule)`);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, spec] of Object.entries(deps)) {
      if (typeof spec === "string" && /^(file|link):/u.test(spec) && !spec.startsWith("file:vendor/")) error(`dependency ${dep} points outside the folder (${spec})`);
    }
    if (pkg.dependencies?.["@electric-sql/pglite"]) error("PGlite is a dev dependency only");
  }
  for (const doc of ["README.md", "DESIGN.md", "AGENTS.md", "LICENSE"]) if (!existsSync(at(doc))) error(`${doc} is missing (studio rule)`);

  return { errors, warnings };
}

const args = process.argv.slice(2);
if (args.length > 0) {
  const folders = args[0] === "--all"
    ? ["private", "public-and-private"].flatMap(kind => {
      const dir = join(root, "tools", kind);
      return existsSync(dir) ? readdirSync(dir).filter(n => lstatSync(join(dir, n)).isDirectory()).map(n => join(dir, n)) : [];
    })
    : args.map(a => resolve(a));
  let failed = false;
  for (const folder of folders) {
    const { errors, warnings } = checkTool(folder);
    const label = relative(root, folder) || folder;
    if (errors.length === 0) console.log(`✓ ${label}${warnings.length ? ` (${warnings.length} warning${warnings.length > 1 ? "s" : ""})` : ""}`);
    else {
      failed = true;
      console.log(`✗ ${label}`);
      for (const e of errors) console.log(`  error: ${e}`);
    }
    for (const w of warnings) console.log(`  warning: ${w}`);
  }
  process.exit(failed ? 1 : 0);
}
