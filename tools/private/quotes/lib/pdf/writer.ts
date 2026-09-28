import { deflateSync } from "node:zlib";
import type { Image } from "./image.ts";
import { widths, winAnsiHigh, type FontName } from "./metrics.ts";

// A small PDF writer of the tool's own (no dependency, no network): A4
// pages, the standard fonts of every PDF reader (Helvetica, Times) in
// WinAnsiEncoding — French accents, the euro sign, typographic quotes —,
// lines, rectangles, and images (the company's logo). Written for this
// tool from ISO 32000-1 (PDF 1.7): a header, numbered objects, a
// cross-reference table and a trailer. Content streams are compressed
// (Flate). The output depends only on what is drawn: the same document
// gives the same bytes.
//
// Coordinates are given from the top-left corner, in points (1/72 inch),
// and turned into PDF's bottom-left ones here.

export const A4 = { width: 595.28, height: 841.89 } as const;

export type Rgb = readonly [number, number, number];

// The code of a character in WinAnsiEncoding, or "?" when it has none.
const reverseHigh = new Map(Object.entries(winAnsiHigh).map(([code, uni]) => [uni, Number(code)]));
export function winAnsi(ch: string): number {
  const cp = ch.codePointAt(0) ?? 63;
  if ((cp >= 32 && cp <= 126) || (cp >= 160 && cp <= 255)) return cp;
  const high = reverseHigh.get(cp);
  if (high !== undefined) return high;
  // Spaces of all widths (Intl writes 1 234,50 € with narrow no-break
  // spaces) become the no-break space; dashes and minus the hyphen.
  if (cp === 0x202f || cp === 0x2007 || cp === 0x2009 || cp === 0x2002 || cp === 0x2003) return 160;
  if (cp === 0x2212 || cp === 0x2010 || cp === 0x2011) return 45;
  if (cp === 0x2032) return 39;
  return 63;
}

export function textWidth(text: string, font: FontName, size: number): number {
  const table = widths[font];
  let w = 0;
  for (const ch of text) {
    const code = winAnsi(ch);
    w += table[code - 32] ?? 500;
  }
  return (w * size) / 1000;
}

// wrap cuts a text into lines no wider than max (the text's own line breaks
// kept; a word longer than a line is cut).
export function wrap(text: string, font: FontName, size: number, max: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/ +/u);
    let line = "";
    for (let word of words) {
      const candidate = line ? line + " " + word : word;
      if (textWidth(candidate, font, size) <= max) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      line = "";
      while (textWidth(word, font, size) > max && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && textWidth(word.slice(0, cut), font, size) > max) cut--;
        out.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      line = word;
    }
    out.push(line);
  }
  return out;
}

// A text as a PDF literal string, in WinAnsi: "(Fran\347ois \(SARL\))".
function literal(text: string): string {
  let out = "(";
  for (const ch of text.replace(/[\r\n\t]/gu, " ")) {
    const code = winAnsi(ch);
    if (code === 40 || code === 41 || code === 92) out += "\\" + String.fromCharCode(code);
    else if (code < 32 || code > 126) out += "\\" + code.toString(8).padStart(3, "0");
    else out += String.fromCharCode(code);
  }
  return out + ")";
}

const n = (value: number) => (Math.round(value * 100) / 100).toString();
const color = (c: Rgb) => c.map(v => n(v)).join(" ");

export class Page {
  readonly ops: string[] = [];
  readonly fonts = new Set<FontName>();
  readonly images = new Set<number>();

  text(x: number, y: number, text: string, font: FontName, size: number, fill: Rgb, options: { align?: "left" | "right" | "center"; spacing?: number } = {}): number {
    const w = textWidth(text, font, size) + (options.spacing ?? 0) * Math.max([...text].length - 1, 0);
    const left = options.align === "right" ? x - w : options.align === "center" ? x - w / 2 : x;
    this.fonts.add(font);
    // Character spacing is part of the graphics state: set every time.
    const tc = `${n(options.spacing ?? 0)} Tc `;
    this.ops.push(`BT /${fontKey(font)} ${n(size)} Tf ${tc}${color(fill)} rg ${n(left)} ${n(A4.height - y)} Td ${literal(text)} Tj ET`);
    return w;
  }

  // A text turned by an angle (degrees), around its start: the draft's mark.
  rotated(x: number, y: number, text: string, font: FontName, size: number, fill: Rgb, degrees: number): void {
    const r = (degrees * Math.PI) / 180;
    const [c, s] = [Math.cos(r), Math.sin(r)];
    this.fonts.add(font);
    this.ops.push(`BT /${fontKey(font)} ${n(size)} Tf 0 Tc ${color(fill)} rg ${n(c)} ${n(s)} ${n(-s)} ${n(c)} ${n(x)} ${n(A4.height - y)} Tm ${literal(text)} Tj ET`);
  }

  rect(x: number, y: number, w: number, h: number, style: { fill?: Rgb; stroke?: Rgb; width?: number }): void {
    const parts: string[] = ["q"];
    if (style.fill) parts.push(`${color(style.fill)} rg`);
    if (style.stroke) parts.push(`${color(style.stroke)} RG ${n(style.width ?? 0.5)} w`);
    parts.push(`${n(x)} ${n(A4.height - y - h)} ${n(w)} ${n(h)} re`);
    parts.push(style.fill && style.stroke ? "B" : style.fill ? "f" : "S");
    parts.push("Q");
    this.ops.push(parts.join(" "));
  }

  line(x1: number, y1: number, x2: number, y2: number, stroke: Rgb, width = 0.5, dash?: readonly number[]): void {
    this.ops.push(`q ${color(stroke)} RG ${n(width)} w ${dash ? `[${dash.map(n).join(" ")}] 0 d ` : ""}${n(x1)} ${n(A4.height - y1)} m ${n(x2)} ${n(A4.height - y2)} l S Q`);
  }

  image(index: number, x: number, y: number, w: number, h: number): void {
    this.images.add(index);
    this.ops.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(A4.height - y - h)} cm /Im${index} Do Q`);
  }
}

const fontKeys: Record<FontName, string> = { Helvetica: "F1", "Helvetica-Bold": "F2", "Times-Roman": "F3", "Times-Bold": "F4", "Times-Italic": "F5" };
const fontKey = (font: FontName) => fontKeys[font];

// A text of the document information (title, author) as UTF-16BE, which
// every reader shows whatever the characters.
function infoString(text: string): string {
  let hex = "FEFF";
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

// A date of the information dictionary: D:20260928120000Z.
function pdfDate(date: Date): string {
  return "D:" + date.toISOString().replace(/[-:T]/gu, "").slice(0, 14) + "Z";
}

export type Info = { title: string; author: string; subject?: string; creator: string; created: Date; language: string };

export class PdfWriter {
  readonly pages: Page[] = [];
  private readonly imageList: Image[] = [];

  addPage(): Page {
    const page = new Page();
    this.pages.push(page);
    return page;
  }

  addImage(image: Image): number {
    this.imageList.push(image);
    return this.imageList.length - 1;
  }

  finish(info: Info): Uint8Array {
    const objects: (Buffer | null)[] = [];
    const reserve = () => {
      objects.push(null);
      return objects.length;
    };
    const set = (ref: number, body: Buffer | string) => {
      objects[ref - 1] = typeof body === "string" ? Buffer.from(body, "latin1") : body;
    };
    const stream = (dict: string, data: Buffer) => Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, "latin1"), data, Buffer.from("\nendstream", "latin1")]);

    const catalog = reserve();
    const pagesRef = reserve();
    const infoRef = reserve();
    const fontRefs = new Map<FontName, number>();
    for (const font of Object.keys(fontKeys) as FontName[]) {
      if (!this.pages.some(p => p.fonts.has(font))) continue;
      const ref = reserve();
      set(ref, `<< /Type /Font /Subtype /Type1 /BaseFont /${font} /Encoding /WinAnsiEncoding >>`);
      fontRefs.set(font, ref);
    }
    const imageRefs = this.imageList.map(image => {
      const ref = reserve();
      let mask = "";
      if (image.alpha) {
        const maskRef = reserve();
        set(maskRef, stream(`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, deflateSync(image.alpha)));
        mask = ` /SMask ${maskRef} 0 R`;
      }
      const filter = image.format === "jpeg" ? "/DCTDecode" : "/FlateDecode";
      const data = image.format === "jpeg" ? Buffer.from(image.data) : deflateSync(image.data);
      const decode = image.colorSpace === "DeviceCMYK" && image.format === "jpeg" && image.adobeInverted ? " /Decode [1 0 1 0 1 0 1 0]" : "";
      set(ref, stream(`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /${image.colorSpace} /BitsPerComponent 8 /Filter ${filter}${decode}${mask}`, data));
      return ref;
    });
    const pageRefs: number[] = [];
    for (const page of this.pages) {
      const contentRef = reserve();
      set(contentRef, stream("/Filter /FlateDecode", deflateSync(Buffer.from(page.ops.join("\n"), "latin1"))));
      const pageRef = reserve();
      const fonts = [...page.fonts].map(f => `/${fontKey(f)} ${fontRefs.get(f)} 0 R`).join(" ");
      const images = [...page.images].map(i => `/Im${i} ${imageRefs[i]} 0 R`).join(" ");
      set(pageRef, `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${n(A4.width)} ${n(A4.height)}] /Resources << /Font << ${fonts} >>${images ? ` /XObject << ${images} >>` : ""} >> /Contents ${contentRef} 0 R >>`);
      pageRefs.push(pageRef);
    }
    set(pagesRef, `<< /Type /Pages /Kids [${pageRefs.map(r => `${r} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`);
    set(catalog, `<< /Type /Catalog /Pages ${pagesRef} 0 R /Lang ${infoString(info.language)} /ViewerPreferences << /DisplayDocTitle true >> >>`);
    set(infoRef, `<< /Title ${infoString(info.title)} /Author ${infoString(info.author)}${info.subject ? ` /Subject ${infoString(info.subject)}` : ""} /Creator ${infoString(info.creator)} /Producer ${infoString("Chest Quotes PDF writer")} /CreationDate (${pdfDate(info.created)}) >>`);

    const chunks: Buffer[] = [Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    let offset = chunks[0]!.length;
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      const head = Buffer.from(`${i + 1} 0 obj\n`, "latin1");
      const tail = Buffer.from("\nendobj\n", "latin1");
      offsets.push(offset);
      const all = Buffer.concat([head, body ?? Buffer.from("null"), tail]);
      chunks.push(all);
      offset += all.length;
    });
    const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n", ...offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
    chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${infoRef} 0 R >>\nstartxref\n${offset}\n%%EOF\n`, "latin1"));
    return new Uint8Array(Buffer.concat(chunks));
  }
}
