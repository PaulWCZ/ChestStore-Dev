// What people wrote, made easy to read — pure (tested alone, used in the
// browser too): the quoted history of an email folded away, web addresses
// made links, a subject without its "Re:" and "[#1042]".

// splitQuoted separates what the sender wrote from the conversation their
// mail program quoted below it ("On Monday, Atelier wrote:" and "> …",
// "Le lundi … a écrit :", Outlook's "-----Original Message-----" or its
// From:/Sent: block). Nothing is folded when nothing would be left.
const header = [
  /^On\b.{0,300}\bwrote:\s*$/iu,
  /^Le\b.{0,300}\ba écrit\s?:\s*$/iu,
  /^-{2,}\s*(Original Message|Message d'origine|Forwarded message|Message transféré)\s*-{2,}\s*$/iu,
  /^(From|De)\s?:\s.+$/u,
];
export function splitQuoted(text: string): { main: string; quoted: string } {
  const lines = text.split("\n");
  let cut = -1;
  for (let i = 1; i < lines.length && cut < 0; i++) {
    const line = lines[i]!.trim();
    const two = i + 1 < lines.length ? `${line} ${lines[i + 1]!.trim()}` : line;
    if (header.slice(0, 3).some(h => h.test(line))) cut = i;
    else if (header[0]!.test(two) || header[1]!.test(two)) cut = i;
    // Outlook: "From: …" followed within four lines by "Sent:"/"Envoyé :".
    else if (header[3]!.test(line) && lines.slice(i + 1, i + 5).some(l => /^(Sent|Envoyé|Date)\s?:/u.test(l.trim()))) cut = i;
  }
  if (cut < 0) {
    // A block of "> " lines to the end.
    let start = lines.length;
    for (let i = lines.length - 1; i >= 1; i--) {
      const l = lines[i]!.trim();
      if (l === "" || l.startsWith(">")) start = i;
      else break;
    }
    if (start < lines.length && lines.slice(start).some(l => l.trim().startsWith(">"))) cut = start;
  }
  if (cut < 0) return { main: text, quoted: "" };
  const main = lines.slice(0, cut).join("\n").trimEnd();
  return main.trim() ? { main, quoted: lines.slice(cut).join("\n").trim() } : { main: text, quoted: "" };
}

// linkify cuts a text into plain parts and web addresses (http and https
// only), the punctuation that ends a sentence left outside the link. With
// contacts (the team's side), email addresses become mailto: links and
// phone numbers tel: links — an agent on a phone calls the customer back in
// one tap.
export type Part = { text: string; url?: string };
const web = /https?:\/\/[^\s<>"'`]+/giu;
const mailAddress = /(?<![\p{L}\p{N}._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}(?![\p{L}\p{N}-])/gu;
// A phone number as people type it: "+33 6 12 34 56 78", "06.12.34.56.78",
// "(0)1 23 45 67 89", "+1 (415) 555-0100" — starting with + or 0 or "(",
// 9 to 15 digits, never glued to a word or another number.
const phoneNumber = /(?<![\p{L}\p{N}+])(\+|\(?0)[\d().\s-]{7,24}\d(?![\p{L}\p{N}])/gu;

function webLinks(text: string): Part[] {
  const out: Part[] = [];
  let at = 0;
  for (const m of text.matchAll(web)) {
    let url = m[0];
    // A closing bracket stays only when the address opened it.
    const open = () => url.split("(").length - 1, close = () => url.split(")").length - 1;
    while (/[.,;:!?\]}»]$/u.test(url) || (url.endsWith(")") && close() > open())) url = url.slice(0, -1);
    if (url.length < 11) continue;
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    out.push({ text: url, url });
    at = m.index + url.length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

// The tel: address of a number as typed ("06 12 34 56 78" → "tel:0612345678").
// A number typed without any separator is a phone only in the shapes
// phones are written ("0612345678", "+33612345678"), never an order number.
export function telOf(typed: string): string | null {
  const international = typed.startsWith("+");
  const digits = (international ? typed.replace(/\(0\)/gu, "") : typed).replace(/[^\d+]/gu, "");
  const count = digits.replace(/\D/gu, "").length;
  if (count < 9 || count > 15 || digits.lastIndexOf("+") > 0) return null;
  if (/^[+\d]+$/u.test(typed) && !/^(0\d{9}|\+\d{9,15})$/u.test(typed)) return null;
  return "tel:" + digits;
}

function contactLinks(part: Part): Part[] {
  if (part.url) return [part];
  const found: { index: number; text: string; url: string }[] = [];
  for (const m of part.text.matchAll(mailAddress)) found.push({ index: m.index, text: m[0], url: "mailto:" + m[0] });
  for (const m of part.text.matchAll(phoneNumber)) {
    const typed = m[0].replace(/[\s.(-]+$/u, "");
    const url = telOf(typed);
    if (url && !found.some(f => m.index < f.index + f.text.length && f.index < m.index + typed.length)) found.push({ index: m.index, text: typed, url });
  }
  found.sort((a, b) => a.index - b.index);
  const out: Part[] = [];
  let at = 0;
  for (const f of found) {
    if (f.index < at) continue;
    if (f.index > at) out.push({ text: part.text.slice(at, f.index) });
    out.push({ text: f.text, url: f.url });
    at = f.index + f.text.length;
  }
  if (at < part.text.length) out.push({ text: part.text.slice(at) });
  return out;
}

export function linkify(text: string, options: { contacts?: boolean } = {}): Part[] {
  const parts = webLinks(text);
  return options.contacts ? parts.flatMap(contactLinks) : parts;
}

// baseSubject is a subject as people mean it: without "Re:", "Fwd:", "TR :",
// "[#1042]", case or extra spaces — to recognise the same conversation.
export function baseSubject(subject: string): string {
  let s = subject.replace(/\[#\d{1,9}\]/gu, " ").trim();
  for (let i = 0; i < 10; i++) {
    const next = s.replace(/^(re|fw|fwd|tr|réf|ref|aw|sv|wg)\s*(\[\d+\])?\s*:\s*/iu, "");
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/gu, " ").trim().toLowerCase();
}

// A robot's address (no-reply, a mail server's notices): it is never sent
// a confirmation, so two robots never write to each other forever.
export const robotAddress = (address: string) => /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|auto-?reply)([+._-][^@]*)?@/iu.test(address);
