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
// only), the punctuation that ends a sentence left outside the link.
export type Part = { text: string; url?: string };
export function linkify(text: string): Part[] {
  const out: Part[] = [];
  let at = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'`]+/giu)) {
    let url = m[0];
    const trail = /[.,;:!?)\]}»]+$/u.exec(url);
    if (trail && !(trail[0].startsWith(")") && url.includes("("))) url = url.slice(0, -trail[0].length);
    if (url.length < 11) continue;
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    out.push({ text: url, url });
    at = m.index + url.length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
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
