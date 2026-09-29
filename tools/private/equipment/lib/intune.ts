import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { can } from "./access.ts";
import { AppError, type ErrorCode } from "./app-error.ts";
import { toCsv } from "./csv.ts";
import type { Query, Sql } from "./db.ts";
import { everyone, people, plainName } from "./people.ts";
import { personByName } from "./importer.ts";

// Microsoft Intune, read only — the first MDM connector (critique round 3).
//
// How it reads, as Microsoft documents it (read on 2026-09-29 from the
// sources of learn.microsoft.com on GitHub; learn.microsoft.com itself was
// blocked from the studio):
// - a token by the client-credentials grant: POST
//   https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token with
//   client_id, client_secret, scope=https://graph.microsoft.com/.default and
//   grant_type=client_credentials; the answer's `access_token`
//   (MicrosoftDocs/entra-docs, docs/identity-platform/v2-oauth2-client-creds-grant-flow.md);
// - the devices: GET https://graph.microsoft.com/v1.0/deviceManagement/managedDevices
//   with the Bearer token, application permission
//   DeviceManagementManagedDevices.Read.All; a page's `value` holds
//   managedDevice objects, `@odata.nextLink` the next page
//   (microsoftgraph/microsoft-graph-docs-contrib,
//   api-reference/v1.0/api/intune-devices-manageddevice-list.md,
//   resources/intune-devices-manageddevice.md, concepts/paging.md);
// - too many requests: 429 with Retry-After (concepts/throttling.md).
//
// The Chest lets the tool reach exactly these two hosts (chest.json
// `network`) with the platform's plain fetch(), through its egress proxy
// (tests answer them with fakeChest({network})); the company's administrator sets the three variables of
// chest.json `env` (an app registration of their tenant). The secret is
// read from the environment when needed, never stored, logged or sent to a
// browser. Nothing is written to Intune.

export const hosts = { login: "https://login.microsoftonline.com", graph: "https://graph.microsoft.com" } as const;
const devicesUrl = `${hosts.graph}/v1.0/deviceManagement/managedDevices`;
// A company of 10 to 200 people: 5,000 devices is far beyond; a page of
// Graph is 100 to 1,000.
const maxDevices = 5000;
const maxPages = 60;
const timeoutMs = 20_000;
const longestWait = 10;

type Settings = { tenant: string; clientId: string; secret: string };
// The environment the three settings are read from (the process's own).
type Env = Readonly<Record<string, string | undefined>>;

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
// A tenant is its id (a GUID) or one of its domains (contoso.onmicrosoft.com).
const tenantPattern = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/iu;

// The three variables, when all are set and look right.
export function settings(env: Env = process.env): Settings | null {
  const tenant = env["INTUNE_TENANT_ID"]?.trim() ?? "";
  const clientId = env["INTUNE_CLIENT_ID"]?.trim() ?? "";
  const secret = env["INTUNE_CLIENT_SECRET"] ?? "";
  if (!tenantPattern.test(tenant) || tenant.length > 253 || !guid.test(clientId) || secret.length === 0 || secret.length > 1024) return null;
  return { tenant, clientId, secret };
}
export const connected = (env: Env = process.env): boolean => settings(env) !== null;

// What the tool reads of a device (the rest of managedDevice is ignored).
// `addresses` (its user's mail address and principal name) are only asked
// of the Chest to learn which member it is, never stored.
export type Device = {
  id: string; serial: string | null; deviceName: string | null; manufacturer: string | null; model: string | null;
  os: string | null; osVersion: string | null; imei: string | null; user: string | null; addresses: string[]; lastCheckIn: string | null;
};

const text = (value: unknown, max = 120): string | null => {
  if (typeof value !== "string") return null;
  const v = value.replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
  return v ? v.slice(0, max) : null;
};
const moment = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  // Intune writes 0001-01-01 for "never".
  return Number.isFinite(t) && t > Date.UTC(2000, 0, 1) ? new Date(t).toISOString() : null;
};

// One managedDevice as the tool keeps it; null when it is not one.
export function readDevice(raw: unknown): Device | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const id = text(d["id"], 80);
  if (!id) return null;
  return {
    id,
    serial: text(d["serialNumber"], 80),
    deviceName: text(d["deviceName"]),
    manufacturer: text(d["manufacturer"]),
    model: text(d["model"]),
    os: text(d["operatingSystem"]),
    osVersion: text(d["osVersion"]),
    imei: text(d["imei"], 40),
    user: text(d["userDisplayName"]),
    addresses: [...new Set([text(d["emailAddress"], 254), text(d["userPrincipalName"], 254)].filter((a): a is string => a !== null && a.includes("@")))],
    lastCheckIn: moment(d["lastSyncDateTime"]),
  };
}

export const serialKey = (serial: string): string => serial.trim().toLowerCase();

async function call(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    } catch {
      throw new AppError("intune_unreachable");
    }
    if ((response.status === 429 || response.status === 503) && attempt === 0) {
      const wait = Number(response.headers.get("retry-after"));
      if (Number.isFinite(wait) && wait >= 0 && wait <= longestWait) {
        await new Promise(resolve => setTimeout(resolve, wait * 1000));
        continue;
      }
    }
    return response;
  }
}

async function token(s: Settings): Promise<string> {
  const body = new URLSearchParams({ client_id: s.clientId, client_secret: s.secret, scope: `${hosts.graph}/.default`, grant_type: "client_credentials" });
  const response = await call(`${hosts.login}/${encodeURIComponent(s.tenant)}/oauth2/v2.0/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body,
  });
  // A wrong tenant, application or secret: Microsoft answers 400 or 401.
  if (response.status === 400 || response.status === 401) throw new AppError("intune_denied");
  if (response.status === 429 || response.status >= 500) throw new AppError("intune_busy");
  if (!response.ok) throw new AppError("intune_invalid");
  const answer = await response.json().catch(() => null) as { access_token?: unknown } | null;
  if (!answer || typeof answer.access_token !== "string" || answer.access_token.length === 0) throw new AppError("intune_invalid");
  return answer.access_token;
}

// Every device Intune manages, page after page. The next page's address
// must stay on Microsoft Graph (it is Graph's own link).
export async function readDevices(env: Env = process.env): Promise<Device[]> {
  const s = settings(env);
  if (!s) throw new AppError("intune_not_connected");
  const bearer = await token(s);
  const devices: Device[] = [];
  let url: string | null = devicesUrl;
  for (let page = 0; url && page < maxPages && devices.length < maxDevices; page++) {
    const response = await call(url, { headers: { authorization: `Bearer ${bearer}`, accept: "application/json" } });
    // The permission DeviceManagementManagedDevices.Read.All not granted
    // (403), or the tenant without Intune.
    if (response.status === 401 || response.status === 403) throw new AppError("intune_denied");
    if (response.status === 429 || response.status >= 500) throw new AppError("intune_busy");
    if (!response.ok) throw new AppError("intune_invalid");
    const answer = await response.json().catch(() => null) as { value?: unknown; "@odata.nextLink"?: unknown } | null;
    if (!answer || !Array.isArray(answer.value)) throw new AppError("intune_invalid");
    for (const raw of answer.value) {
      const d = readDevice(raw);
      if (d) devices.push(d);
    }
    const next = answer["@odata.nextLink"];
    url = typeof next === "string" && next.startsWith(`${hosts.graph}/`) ? next : null;
  }
  return devices.slice(0, maxDevices);
}

function manager(actor: Member | null): Member {
  if (!actor || !can(actor, "items.manage")) throw new AppError("forbidden");
  return actor;
}

const outcomes: Partial<Record<ErrorCode, string>> = {
  intune_not_connected: "not_connected", intune_denied: "denied", intune_unreachable: "unreachable", intune_busy: "busy", intune_invalid: "invalid",
};

// Which member each device's user is: the Chest matches the addresses
// Intune gives (members.matchEmails, studio.15), and the tool learns member
// ids only — never an address, and never a guess between two people of the
// same name. A Chest without that call yet (it answers 404) falls back to
// the member of the same name, when exactly one has it.
async function membersOf(devices: Device[]): Promise<Map<Device, string | null>> {
  const out = new Map<Device, string | null>();
  try {
    const ids = await members.matchEmails(devices.flatMap(d => d.addresses));
    for (const d of devices) out.set(d, d.addresses.map(a => ids[a]).find(Boolean) ?? null);
    return out;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    // Without the Chest, every match would be lost: the last read stays,
    // and the step says the Chest did not answer.
    if (error.status !== 404) throw new AppError("unavailable");
  }
  const listed = await everyone();
  if (!listed.ok) throw new AppError("unavailable");
  const personOf = personByName(listed.people);
  for (const d of devices) out.set(d, d.user ? personOf(d.user) : null);
  return out;
}

// Reads Intune and keeps what it says of each device with a serial number
// (replacing the last read), with the member it names (above). A manager
// asks ("Read Intune now"), or the nightly schedule (`by` "schedule"). A
// failed read keeps the last one and says why.
export async function refresh(sql: Sql, actor: Member | null | "schedule", env: Env = process.env): Promise<{ devices: number; withoutSerial: number; list: (Device & { member: string | null })[] }> {
  const by = actor === "schedule" ? "schedule" : manager(actor).id;
  let devices: Device[];
  try {
    devices = await readDevices(env);
  } catch (error) {
    const outcome = error instanceof AppError ? outcomes[error.code] : undefined;
    if (outcome) await sql`insert into intune_reads (by, outcome) values (${by}, ${outcome})`;
    throw error;
  }
  const memberOf = await membersOf(devices);
  const now = new Date();
  // One line per serial number: a device enrolled twice keeps its latest
  // check-in.
  const bySerial = new Map<string, Device>();
  for (const d of devices) {
    if (!d.serial) continue;
    const key = serialKey(d.serial);
    const before = bySerial.get(key);
    if (!before || (d.lastCheckIn ?? "") > (before.lastCheckIn ?? "")) bySerial.set(key, d);
  }
  const withoutSerial = devices.filter(d => !d.serial).length;
  await sql.begin(async tx => {
    await tx`delete from intune_devices`;
    for (const [key, d] of bySerial) {
      await tx`insert into intune_devices (serial_key, serial, device_name, manufacturer, model, os, os_version, last_check_in, member_id, read_at)
        values (${key}, ${d.serial}, ${d.deviceName}, ${d.manufacturer}, ${d.model}, ${d.os}, ${d.osVersion}, ${d.lastCheckIn}, ${memberOf.get(d) ?? null}, ${now})`;
    }
    await tx`insert into intune_reads (by, outcome, devices, without_serial) values (${by}, 'ok', ${bySerial.size}, ${withoutSerial})`;
  });
  return { devices: bySerial.size, withoutSerial, list: devices.map(d => ({ ...d, member: memberOf.get(d) ?? null })) };
}

// ---- What the pages read -----------------------------------------------------

export type IntuneFacts = { deviceName: string | null; os: string | null; osVersion: string | null; lastCheckIn: string | null; member: string | null; readAt: string };

// What the last read said of the device with this serial number.
export async function factsOf(sql: Query, actor: Member | null, serial: string | null): Promise<IntuneFacts | null> {
  manager(actor);
  if (!serial) return null;
  const [row] = await sql<{ device_name: string | null; os: string | null; os_version: string | null; last_check_in: Date | null; member_id: string | null; read_at: Date }[]>`
    select device_name, os, os_version, last_check_in, member_id, read_at from intune_devices where serial_key = ${serialKey(serial)}`;
  if (!row) return null;
  return {
    deviceName: row.device_name, os: row.os, osVersion: row.os_version, lastCheckIn: row.last_check_in ? new Date(row.last_check_in).toISOString() : null,
    member: row.member_id, readAt: new Date(row.read_at).toISOString(),
  };
}

export type IntuneStatus = {
  connected: boolean;
  last: { at: string; outcome: string; devices: number | null; withoutSerial: number | null } | null;
  lastGood: string | null;
  // Devices of the last read no item has the serial number of.
  missing: number;
  // Items whose holder is not the person Intune names (both known; an
  // item away for repair, lost or retired is not asked).
  differ: { itemId: string; name: string; tag: string; holder: string | null; place: string | null; intune: string }[];
};

export async function status(sql: Query, actor: Member | null, env: Env = process.env): Promise<IntuneStatus> {
  manager(actor);
  const [last] = await sql<{ at: Date; outcome: string; devices: number | null; without_serial: number | null }[]>`
    select at, outcome, devices, without_serial from intune_reads order by id desc limit 1`;
  const [good] = await sql<{ at: Date }[]>`select at from intune_reads where outcome = 'ok' order by id desc limit 1`;
  const [missing] = await sql<{ n: number }[]>`
    select count(*)::int as n from intune_devices d
    where not exists (select 1 from items i where i.deleted_at is null and i.serial is not null and lower(trim(i.serial)) = d.serial_key)`;
  const differ = await sql<{ id: string; name: string; tag: string; holder: string | null; place: string | null; member_id: string }[]>`
    select i.id, i.name, i.tag, i.holder, i.place, d.member_id from intune_devices d
    join items i on i.deleted_at is null and i.serial is not null and lower(trim(i.serial)) = d.serial_key
    join categories c on c.id = i.category_id and c.kind = 'asset'
    where d.member_id is not null and d.member_id <> 'erased' and i.status not in ('retired', 'lost', 'in_repair') and (i.holder is null or i.holder <> d.member_id)
    order by i.tag limit 100`;
  return {
    connected: connected(env),
    last: last ? { at: new Date(last.at).toISOString(), outcome: last.outcome, devices: last.devices, withoutSerial: last.without_serial } : null,
    lastGood: good ? new Date(good.at).toISOString() : null,
    missing: missing?.n ?? 0,
    differ: differ.map(r => ({ itemId: String(r.id), name: r.name, tag: r.tag, holder: r.holder, place: r.place, intune: r.member_id })),
  };
}

// ---- Adding what Intune knows and Equipment does not ----------------------

// The devices of Intune (just read) no item has the serial number of, as a
// spreadsheet the importer reads (its preview, then its import: the same
// checks, nothing added twice). "Assigned to" is the name, today, of the
// member the device's address matched; a device no member matched keeps
// the name Intune gives, which the preview shows the manager as found or
// not before anything is imported. Columns in
// English, which the importer knows; the operating system and the IMEI go
// to the fields of those names.
export async function missingAsCsv(sql: Query, actor: Member | null, devices: (Device & { member?: string | null })[]): Promise<{ text: string; count: number }> {
  manager(actor);
  const who = await people(devices.flatMap(d => d.member ? [d.member] : []));
  const known = new Set((await sql<{ serial: string }[]>`select serial from items where deleted_at is null and serial is not null`).map(r => serialKey(r.serial)));
  const seen = new Set<string>();
  const rows: string[][] = [];
  for (const d of devices) {
    if (!d.serial) continue;
    const key = serialKey(d.serial);
    if (known.has(key) || seen.has(key)) continue;
    seen.add(key);
    const name = [d.manufacturer, d.model].filter(Boolean).join(" ") || d.deviceName || d.serial;
    const matched = d.member ? who.get(d.member) : undefined;
    const holder = matched?.status === "member" ? plainName(matched, "en") : d.user ?? "";
    rows.push([name, kindOf(d.os), d.serial, holder, [d.os, d.osVersion].filter(Boolean).join(" "), d.imei ?? ""]);
  }
  return { text: toCsv([["Name", "Category", "Serial number", "Assigned to", "Operating system", "IMEI"], ...rows]), count: rows.length };
}

// Intune's operating system to a category the importer knows.
export function kindOf(os: string | null): string {
  const o = (os ?? "").toLowerCase();
  if (/ios|ipados|android/u.test(o)) return "phone";
  if (/windows|macos|mac os|linux|chrome/u.test(o)) return "laptop";
  return "other";
}
