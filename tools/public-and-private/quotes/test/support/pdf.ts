import { inflateSync } from "node:zlib";
import { winAnsiHigh } from "../../src/pdf/metrics.ts";

// The text a PDF of the tool shows, read back from its bytes the way a
// reader's text extraction does it: each compressed content stream
// inflated, each string shown (Tj) decoded from WinAnsi, in order, joined
// by spaces (a sentence wrapped on two lines reads whole again).
export function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const shown: string[] = [];
  for (const m of raw.matchAll(/<<([^]*?)>>\nstream\n/gu)) {
    if (!m[1]!.includes("/FlateDecode") || m[1]!.includes("/Subtype /Image")) continue;
    const length = Number(/\/Length (\d+)/u.exec(m[1]!)?.[1]);
    const start = m.index! + m[0].length;
    const content = inflateSync(Buffer.from(raw.slice(start, start + length), "latin1")).toString("latin1");
    for (const t of content.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/gu)) shown.push(decode(t[1]!));
  }
  return shown.join(" ").replace(/[\s ]+/gu, " ");
}

function decode(literal: string): string {
  let out = "";
  for (let i = 0; i < literal.length; i++) {
    let code = literal.charCodeAt(i);
    if (literal[i] === "\\") {
      const octal = /^[0-7]{1,3}/u.exec(literal.slice(i + 1));
      if (octal) {
        code = parseInt(octal[0], 8);
        i += octal[0].length;
      } else {
        code = literal.charCodeAt(++i);
      }
    }
    out += String.fromCodePoint(winAnsiHigh[code] ?? code);
  }
  return out;
}

// The pages of a PDF, counted from its page tree.
export function pageCount(bytes: Uint8Array): number {
  return Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/u.exec(Buffer.from(bytes).toString("latin1"))?.[1] ?? 0);
}
