// Checks a tool folder the way a Chest checks a source archive before it
// builds it (reference/contract/application-contract.md, "Building from
// source", "Tool names", "Server tools"), plus the studio's own rules. The
// real `chest check` does not exist yet: this is what it should catch.
//
//   node scripts/check-manifest.mjs tools/private/<name> [more folders…]
//   node scripts/check-manifest.mjs --all
//
// Exit code 1 when any folder has an error. Where the contract does not give
// an exact grammar (role identifiers), the rule used is marked "assumed".
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The keys the SDK working copy proposes for the manifest, and their checks.
const proposalKeys = new Set(["schedules"]);
const schedulesPath = join(root, "sdk", "dist", "src", "schedules.js");
const schedulesApi = existsSync(schedulesPath) ? await import(pathToFileURL(schedulesPath).href) : null;

const topKeys = new Set(["version", "name", "title", "description", "icon", "preview", "roles", "role_labels", "public", "csp", "capabilities", "receives", "network", "env", "files", "build"]);
const buildKeys = new Set(["runtime", "install", "command", "start", "port", "static"]);
const capabilityOrder = ["database", "files", "members", "members.email", "notifications"];
const reservedEnv = /^(CHEST_.*|PORT|NODE_.*|NPM_.*|HOME|PATH|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)$/u;
// Control (C0, C1) and invisible formatting characters (sourcefile.ValidText).
const invisible = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]/u;
const scriptName = /^[a-z0-9][a-z0-9:_-]{0,63}$/u;
const label = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/u;
const size = { icon: 64 << 10, preview: 512 << 10, manifest: 16 << 10 };

function checkHost(entry) {
  if (entry === "*") return true;
  const name = entry.startsWith("*.") ? entry.slice(2) : entry;
  if (name.length > 253 || name.endsWith(".") || name !== name.toLowerCase()) return false;
  const labels = name.split(".");
  if (labels.length < 2 || !labels.every(l => label.test(l)) || /^[0-9]+$/u.test(labels.at(-1))) return false;
  if (name === "localhost" || name.endsWith(".localhost")) return false;
  return true;
}

// pngSize reads the dimensions of a PNG from its IHDR chunk; jpegSize from
// its first SOF marker.
function imageSize(bytes, kind) {
  if (kind === "png") {
    if (bytes.length < 24 || bytes.toString("latin1", 1, 4) !== "PNG" || bytes.toString("latin1", 12, 16) !== "IHDR") return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (kind === "jpg") {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1];
      const length = bytes.readUInt16BE(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
      at += 2 + length;
    }
    return null;
  }
  if (kind === "webp") return bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP" ? { width: 0, height: 0 } : null;
  return null;
}

function checkSvg(text) {
  const problems = [];
  const body = text.replace(/^\uFEFF?\s*(<\?xml[^>]*\?>\s*)?/u, "").replace(/<!--[\s\S]*?-->/gu, "");
  if (!/^<svg[\s>]/u.test(body.trimStart())) problems.push("its root is not <svg>");
  if (/<!DOCTYPE/iu.test(text)) problems.push("it has a DOCTYPE");
  if (/<script/iu.test(text)) problems.push("it has a script");
  if (/\son[a-z]+\s*=/iu.test(text)) problems.push("it has an on* handler");
  if (/href\s*=/iu.test(text)) problems.push("it has an href");
  if (/<use[\s>/]/iu.test(text)) problems.push("it has <use>");
  if (/<image[\s>/]/iu.test(text)) problems.push("it has <image>");
  if (/<foreignObject/iu.test(text)) problems.push("it has <foreignObject>");
  if (/url\(/iu.test(text)) problems.push("it has url(");
  if (/<text[\s>]/iu.test(text)) problems.push("it has <text> (studio rule: no text in the icon)");
  return problems;
}

// duplicateKeys scans JSON text and names every key repeated in one object.
function duplicateKeys(text) {
  const found = [];
  const stack = [];
  let expectKey = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") { stack.push(new Set()); expectKey = true; }
    else if (c === "[") { stack.push(null); }
    else if (c === "}" || c === "]") { stack.pop(); }
    else if (c === ",") { expectKey = stack.at(-1) instanceof Set; }
    else if (c === '"') {
      let j = i + 1, value = "";
      while (j < text.length && text[j] !== '"') { if (text[j] === "\\") { value += text[j + 1]; j += 2; } else value += text[j++]; }
      if (expectKey && stack.at(-1) instanceof Set) {
        if (stack.at(-1).has(value)) found.push(value);
        stack.at(-1).add(value);
        expectKey = false;
      }
      i = j;
    }
  }
  return found;
}

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

  for (const required of ["chest.json", "package.json", "package-lock.json"]) if (!existsSync(at(required))) error(`${required} is missing at the root`);
  if (!existsSync(at("chest.json"))) return { errors, warnings };

  const raw = readFileSync(at("chest.json"));
  if (raw.length > size.manifest) error(`chest.json is ${raw.length} bytes: 16 KiB at most`);
  const text = raw.toString("utf8");
  // Duplicate keys are refused: JSON.parse keeps the last, so find them by hand.
  for (const key of duplicateKeys(text)) error(`duplicate key "${key}"`);
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (e) {
    error(`chest.json is not JSON: ${e.message}`);
    return { errors, warnings };
  }
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    error("chest.json is not an object");
    return { errors, warnings };
  }
  for (const key of Object.keys(manifest)) if (!topKeys.has(key)) error(`unknown key "${key}"`);
  if (manifest.version !== 2) error('version 2 expected: declare "version": 2');

  const name = manifest.name;
  if (typeof name !== "string" || name.length > 48 || !/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(name) || ["login", "node"].includes(name)) error(`name "${name}" is not a tool name (a host label of at most 48 lowercase letters, digits and single interior hyphens)`);
  else if (basename(folder) !== name) warnings.push(`the folder is "${basename(folder)}" but the tool is "${name}"`);

  for (const [key, max] of [["title", 48], ["description", 160]]) {
    const value = manifest[key];
    if (value === undefined) {
      warnings.push(`no ${key}: the store shows the name alone`);
      continue;
    }
    if (typeof value !== "string" || value.length === 0 || [...value].length > max || invisible.test(value)) error(`${key} must be 1 to ${max} characters, without control or invisible characters`);
  }

  // Images: chest/<name>.svg|png for the icon, chest/<name>.png|jpg|webp for the preview.
  for (const [key, kinds] of [["icon", ["svg", "png"]], ["preview", ["png", "jpg", "webp"]]]) {
    const value = manifest[key];
    if (value === undefined) {
      warnings.push(`no ${key}`);
      continue;
    }
    const match = typeof value === "string" ? /^chest\/[A-Za-z0-9._-]+\.([a-z]+)$/u.exec(value) : null;
    if (!match || !kinds.includes(match[1])) {
      error(`${key} must be chest/<file>.${kinds.join("|")}`);
      continue;
    }
    if (!existsSync(at(value))) {
      error(`${key} ${value} is missing`);
      continue;
    }
    const bytes = readFileSync(at(value));
    if (bytes.length > size[key]) error(`${key} is ${bytes.length} bytes: ${size[key] >> 10} KiB at most`);
    if (match[1] === "svg") for (const problem of checkSvg(bytes.toString("utf8"))) error(`${key} SVG refused: ${problem}`);
    else {
      const dims = imageSize(bytes, match[1]);
      if (!dims) error(`${key} is not a ${match[1].toUpperCase()}`);
      else if (dims.width > 4096 || dims.height > 4096) error(`${key} is ${dims.width}×${dims.height}: 4096 px at most`);
    }
  }

  // Roles: identifiers from strongest to weakest (grammar assumed: the
  // contract refers to the package parser; the Chest shows at most 16).
  const roles = manifest.roles;
  if (roles !== undefined) {
    if (!Array.isArray(roles) || roles.length > 16 || !roles.every(r => typeof r === "string" && /^[a-z][a-z0-9_-]{0,31}$/u.test(r)) || new Set(roles).size !== roles.length) error("roles must be 1 to 16 distinct identifiers (assumed grammar ^[a-z][a-z0-9_-]{0,31}$), strongest first");
  } else warnings.push("no roles: every member has the same rights");
  if (manifest.role_labels !== undefined) {
    const labels = manifest.role_labels;
    if (labels === null || typeof labels !== "object" || Array.isArray(labels) || Object.keys(labels).length === 0) error("role_labels must be a non-empty object");
    else for (const [role, word] of Object.entries(labels)) {
      if (!Array.isArray(roles) || !roles.includes(role)) error(`role_labels names "${role}", which roles does not declare`);
      if (typeof word !== "string" || word.length < 1 || [...word].length > 40 || word.trim() !== word || invisible.test(word)) error(`role label of "${role}" must be 1 to 40 printable characters, no space at either end`);
    }
  }

  if (manifest.public !== undefined && typeof manifest.public !== "boolean") error("public must be true or false");
  if (manifest.csp !== undefined && (manifest.csp !== "tool" || manifest.public !== true)) error('csp is only "tool", and only with public: true');

  const capabilities = manifest.capabilities ?? [];
  if (!Array.isArray(capabilities) || !capabilities.every(c => capabilityOrder.includes(c)) || new Set(capabilities).size !== capabilities.length) error(`capabilities must be distinct entries among ${capabilityOrder.join(", ")}`);
  else if (capabilities.includes("members.email") && !capabilities.includes("members")) error("members.email needs members");
  if (manifest.receives !== undefined) {
    if (!Array.isArray(manifest.receives) || manifest.receives.length !== 1 || manifest.receives[0] !== "member.*") error('receives is only ["member.*"]');
    else if (!capabilities.includes("members")) error('receives ["member.*"] needs the capability members');
  }
  if (manifest.files !== undefined) {
    const files = manifest.files;
    const amount = v => typeof v === "string" && /^[1-9][0-9]* (MiB|GiB)$/u.test(v) ? Number(v.split(" ")[0]) * (v.endsWith("GiB") ? 1024 : 1) : null;
    if (!capabilities.includes("files")) error("files needs the capability files");
    if (files === null || typeof files !== "object" || Object.keys(files).some(k => !["quota", "maxObject"].includes(k))) error('files is {"quota", "maxObject"} only');
    else {
      const quota = files.quota === undefined ? 1024 : amount(files.quota);
      const object = files.maxObject === undefined ? 32 : amount(files.maxObject);
      if (quota === null || quota < 100 || quota > 100 * 1024) error("files.quota is 100 MiB to 100 GiB, whole MiB or GiB");
      if (object === null || object < 1 || object > 512) error("files.maxObject is 1 to 512 MiB");
    }
  }
  if (manifest.network !== undefined) {
    const network = manifest.network;
    if (!Array.isArray(network) || network.length < 1 || network.length > 32 || new Set(network).size !== network.length) error("network is 1 to 32 distinct entries");
    else {
      for (const entry of network) if (typeof entry !== "string" || !checkHost(entry)) error(`network entry "${entry}" is not a host name, *.domain or *`);
      if (network.includes("*") && network.length > 1) error("network * stands alone");
      for (const entry of network) for (const other of network) if (entry !== other && other.startsWith("*.") && (entry === other || entry.endsWith(other.slice(1)))) error(`network entry "${entry}" is covered by "${other}"`);
    }
  }
  if (manifest.env !== undefined) {
    const env = manifest.env;
    if (!Array.isArray(env) || env.length < 1 || env.length > 32 || new Set(env).size !== env.length) error("env is 1 to 32 distinct names");
    else for (const v of env) if (typeof v !== "string" || !/^[A-Z_][A-Z0-9_]{0,63}$/u.test(v) || reservedEnv.test(v)) error(`env name "${v}" is invalid or set by the Chest`);
  }

  const build = manifest.build;
  let pkg = null;
  try {
    pkg = JSON.parse(readFileSync(at("package.json"), "utf8"));
  } catch {
    if (existsSync(at("package.json"))) error("package.json is not JSON");
  }
  if (build === null || typeof build !== "object") error("build is required");
  else {
    for (const key of Object.keys(build)) if (!buildKeys.has(key)) error(`unknown key "build.${key}"`);
    if (build.runtime !== "node") error('build.runtime is "node"');
    if (build.install !== "npm ci") error('build.install is exactly "npm ci"');
    const script = (command, key, allowStart) => {
      if (allowStart && command === "npm start") return "start";
      const m = typeof command === "string" ? /^npm run (\S+)$/u.exec(command) : null;
      if (!m || !scriptName.test(m[1])) {
        error(`build.${key} is ${allowStart ? '"npm start" or ' : ""}"npm run <script>", never a shell command`);
        return null;
      }
      return m[1];
    };
    const scripts = pkg?.scripts ?? {};
    if (build.command !== undefined) {
      const s = script(build.command, "command", false);
      if (s && !scripts[s]) error(`package.json has no script "${s}" (build.command)`);
    }
    const start = script(build.start, "start", true);
    if (start && !scripts[start]) error(`package.json has no script "${start}" (build.start)`);
    if (!Number.isInteger(build.port) || build.port < 1024 || build.port > 65535) error("build.port is 1024 to 65535");
    if (build.static !== undefined && (!Array.isArray(build.static) || build.static.length > 4 || !build.static.every(p => typeof p === "string" && /^\/[a-z0-9._-]+(\/[a-z0-9._-]+)*\/$/u.test(p) && !p.split("/").some(seg => seg === "." || seg === "..") && !p.startsWith("/chest/") && !p.startsWith("/_chest/")))) error("build.static is at most 4 prefixes like /_next/static/, never /chest/ nor /_chest/");
  }

  // Proposals of the SDK working copy: keys a Chest does not accept yet,
  // kept in chest.proposals.json so chest.json stays installable today.
  if (existsSync(at("chest.proposals.json"))) {
    let proposals = null;
    try {
      proposals = JSON.parse(readFileSync(at("chest.proposals.json"), "utf8"));
    } catch (e) {
      error(`chest.proposals.json is not JSON: ${e.message}`);
    }
    if (proposals) {
      for (const key of Object.keys(proposals)) if (!proposalKeys.has(key)) error(`chest.proposals.json: unknown proposal key "${key}"`);
      if (proposals.schedules !== undefined) {
        if (!schedulesApi) warnings.push("schedules not checked: build sdk/ first (npm run build)");
        else for (const problem of schedulesApi.checkSchedules(proposals.schedules)) error(`chest.proposals.json: ${problem}`);
      }
    }
  }

  // Studio rules beyond the contract.
  if (pkg) {
    for (const s of ["dev", "build", "start", "test"]) if (!pkg.scripts?.[s]) error(`package.json has no "${s}" script (studio rule)`);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, spec] of Object.entries(deps)) {
      if (typeof spec === "string" && /^(file|link):/u.test(spec) && !spec.startsWith("file:vendor/")) error(`dependency ${dep} points outside the folder (${spec})`);
    }
    if (pkg.dependencies?.["@electric-sql/pglite"]) error("PGlite is a dev dependency only");
  }
  if (existsSync(at("migrations"))) {
    const seen = new Set();
    for (const file of readdirSync(at("migrations"))) {
      if (!/^[0-9]{4}_[a-z0-9_]+\.sql$/u.test(file)) error(`migrations/${file}: name it NNNN_words.sql`);
      const number = file.slice(0, 4);
      if (seen.has(number)) error(`migrations: two files numbered ${number}`);
      seen.add(number);
      const sql = readFileSync(at(join("migrations", file)), "utf8");
      if (/^\s*(begin|commit|rollback)\s*;/imu.test(sql)) error(`migrations/${file}: the Chest runs each file in its own transaction; do not begin or commit`);
    }
  }
  for (const doc of ["README.md", "DESIGN.md", "AGENTS.md", "LICENSE"]) if (!existsSync(at(doc))) error(`${doc} is missing (studio rule)`);

  // The archive: no links, no node_modules shipped (they are ignored by git),
  // under 32 MiB compressed.
  let total = 0;
  walk(folder, (path, stat) => {
    if (stat.isSymbolicLink()) error(`${relative(folder, path)} is a link: an archive refuses links`);
    if (stat.isFile()) total += stat.size;
  }, name => ["node_modules", ".next", ".test-dist", ".git"].includes(name));
  if (total > 200 << 20) error(`the folder holds ${(total / 1048576).toFixed(1)} MiB: the archive would exceed its limits`);
  else if (total > 32 << 20) warnings.push(`the folder holds ${(total / 1048576).toFixed(1)} MiB uncompressed; the archive limit is 32 MiB compressed`);

  // Nothing points outside the folder: imports that climb out of it.
  walk(folder, (path, stat) => {
    if (!stat.isFile() || !/\.(ts|tsx|mjs|js|css)$/u.test(path)) return;
    const source = readFileSync(path, "utf8");
    for (const m of source.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|@import\s+|url\(\s*)["']([^"']+)["']/gu)) {
      const target = m[1];
      if (!target.startsWith(".")) continue;
      const resolved = resolve(dirname(path), target);
      if (relative(folder, resolved).startsWith("..")) error(`${relative(folder, path)} imports ${target}, outside the tool's folder`);
    }
  }, name => ["node_modules", ".next", ".test-dist", ".git", "vendor"].includes(name));

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
