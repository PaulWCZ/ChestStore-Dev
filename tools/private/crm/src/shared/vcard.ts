import { AppError } from "./app-error.ts";

// Safe in the browser: no SDK here.
// vCard, the address book format of every phone and mail program: read
// 3.0 (RFC 2426, what most phones, Google and Apple still write), 4.0
// (RFC 6350) and the old 2.1's quoted-printable; write 4.0. Small, tested,
// no dependency. Only what a contact here holds is read: the rest of a card
// (photos, birthdays, addresses) is left aside.

export type Card = { name: string; email: string; phone: string; title: string; company: string; notes: string; tags: string[] };

type Line = { name: string; params: Map<string, string[]>; value: string };

// Lines, unfolded: a line starting with a space or a tab continues the one
// before it (RFC 6350 §3.2). Quoted-printable values of 2.1 end a line with
// "=" when they continue.
function lines(text: string): string[] {
  const raw = text.replace(/^\uFEFF/u, "").split(/\r\n|\n|\r/u);
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) out[out.length - 1] += line.slice(1);
    else if (out.length > 0 && /ENCODING=QUOTED-PRINTABLE/iu.test(out.at(-1)!.split(":")[0]!) && out.at(-1)!.endsWith("=")) out[out.length - 1] = out.at(-1)!.slice(0, -1) + line;
    else out.push(line);
  }
  return out;
}

// One content line: [group.]NAME;PARAM=a,b;TYPE=x:value — the first colon
// outside double quotes ends the name and its parameters.
function parseLine(line: string): Line | null {
  let quoted = false;
  let at = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ":" && !quoted) {
      at = i;
      break;
    }
  }
  if (at < 0) return null;
  const head = line.slice(0, at);
  const value = line.slice(at + 1);
  const parts = splitOutsideQuotes(head, ";");
  const name = (parts.shift() ?? "").replace(/^[^.]*\./u, "").toUpperCase();
  const params = new Map<string, string[]>();
  for (const p of parts) {
    const eq = p.indexOf("=");
    // 2.1 writes bare types: TEL;WORK;VOICE:…
    const key = (eq < 0 ? "TYPE" : p.slice(0, eq)).toUpperCase();
    const values = (eq < 0 ? p : p.slice(eq + 1)).split(",").map(v => v.replace(/^"|"$/gu, "").toLowerCase());
    params.set(key, [...(params.get(key) ?? []), ...values]);
  }
  return { name, params, value };
}

function splitOutsideQuotes(text: string, separator: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    if (c === separator && !quoted) {
      out.push(current);
      current = "";
    } else current += c;
  }
  out.push(current);
  return out;
}

// Splits a value on a separator not escaped by a backslash, then unescapes
// each part.
function splitValue(value: string, separator: ";" | ","): string[] {
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (c === "\\" && i + 1 < value.length) {
      current += c + value[i + 1];
      i++;
    } else if (c === separator) {
      out.push(current);
      current = "";
    } else current += c;
  }
  out.push(current);
  return out.map(unescape);
}

function unescape(value: string): string {
  return value.replace(/\\([\\;,nN:])/gu, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (c === "=" && /^[0-9A-Fa-f]{2}$/u.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(...new TextEncoder().encode(c));
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

const cut = (value: string, max: number) => [...value.replace(/\s+/gu, " ").trim()].slice(0, max).join("");
const preferred = (list: Line[]): Line | undefined =>
  list.find(l => (l.params.get("TYPE") ?? []).includes("pref") || (l.params.get("PREF") ?? []).includes("1")) ?? list.find(l => (l.params.get("TYPE") ?? []).some(t => t === "work" || t === "cell")) ?? list[0];

// parseVcards reads every card of a file (at most max). A file with no
// card at all is refused.
export function parseVcards(text: string, max = 5000): Card[] {
  const cards: Card[] = [];
  let current: Line[] | null = null;
  for (const raw of lines(text)) {
    if (raw.trim() === "") continue;
    const line = parseLine(raw);
    if (!line) continue;
    if (line.name === "BEGIN" && line.value.trim().toUpperCase() === "VCARD") {
      current = [];
      continue;
    }
    if (line.name === "END" && line.value.trim().toUpperCase() === "VCARD") {
      if (current) {
        const card = toCard(current);
        if (card) cards.push(card);
        if (cards.length >= max) break;
      }
      current = null;
      continue;
    }
    if (!current) continue;
    if ((line.params.get("ENCODING") ?? []).includes("quoted-printable")) line.value = decodeQuotedPrintable(line.value);
    current.push(line);
  }
  if (cards.length === 0) throw new AppError("vcard_invalid");
  return cards;
}

function toCard(props: Line[]): Card | null {
  const all = (name: string) => props.filter(p => p.name === name);
  const first = (name: string) => all(name)[0];
  const n = first("N") ? splitValue(first("N")!.value, ";") : [];
  const fromN = [n[3], n[1], n[2], n[0], n[4]].map(s => (s ?? "").trim()).filter(Boolean).join(" ");
  const org = first("ORG") ? splitValue(first("ORG")!.value, ";")[0] ?? "" : "";
  const email = preferred(all("EMAIL"))?.value ?? "";
  const tel = preferred(all("TEL"))?.value.replace(/^tel:/iu, "") ?? "";
  const fn = first("FN") ? unescape(first("FN")!.value) : "";
  const name = cut(fn || fromN || org || email, 160);
  if (!name) return null;
  const tags = all("CATEGORIES").flatMap(c => splitValue(c.value, ",")).map(t => cut(t, 30)).filter(Boolean);
  return {
    name,
    email: cut(unescape(email), 254),
    phone: cut(unescape(tel), 40),
    title: cut(first("TITLE") ? unescape(first("TITLE")!.value) : first("ROLE") ? unescape(first("ROLE")!.value) : "", 120),
    company: cut(org, 160),
    notes: [...(first("NOTE") ? unescape(first("NOTE")!.value) : "")].slice(0, 5000).join("").trim(),
    tags: [...new Set(tags)].slice(0, 20),
  };
}

// Writing: text values escape backslash, comma, semicolon and line breaks
// (RFC 6350 §3.4); lines are folded at 75 octets without cutting a
// character in two, CRLF between lines.
function escape(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/\r\n|\r|\n/gu, "\\n").replace(/,/gu, "\\,").replace(/;/gu, "\\;");
}

export function fold(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = out.length === 0 ? 75 : 74; // a continuation starts with a space
    if (size + bytes > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

// A person's name split for N: the last word is the family name.
function nameParts(name: string): { family: string; given: string } {
  const words = name.trim().split(/\s+/u);
  if (words.length < 2) return { family: words[0] ?? "", given: "" };
  return { family: words.at(-1)!, given: words.slice(0, -1).join(" ") };
}

export function toVcard(card: Card & { uid?: string; revised?: string }): string {
  const { family, given } = nameParts(card.name);
  const lines = ["BEGIN:VCARD", "VERSION:4.0", "PRODID:-//Chest Clients//EN", `FN:${escape(card.name)}`, `N:${escape(family)};${escape(given)};;;`];
  if (card.company) lines.push(`ORG:${escape(card.company)}`);
  if (card.title) lines.push(`TITLE:${escape(card.title)}`);
  if (card.email) lines.push(`EMAIL;TYPE=work:${escape(card.email)}`);
  if (card.phone) lines.push(`TEL;TYPE=work,voice;VALUE=text:${escape(card.phone)}`);
  if (card.tags.length > 0) lines.push(`CATEGORIES:${card.tags.map(escape).join(",")}`);
  if (card.notes) lines.push(`NOTE:${escape(card.notes)}`);
  if (card.uid) lines.push(`UID:${card.uid}`);
  if (card.revised) lines.push(`REV:${card.revised.replace(/[-:]/gu, "").replace(/\.\d+/u, "")}`);
  lines.push("END:VCARD");
  return lines.map(fold).join("\r\n") + "\r\n";
}
