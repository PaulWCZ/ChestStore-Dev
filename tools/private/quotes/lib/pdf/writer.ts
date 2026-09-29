import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { loadFont, winAnsiUnicode } from "./fonts.ts";
import { srgbProfile } from "./icc.ts";
import type { Image } from "./image.ts";
import { winAnsiHigh, type FontName } from "./metrics.ts";

// A small PDF writer of the tool's own (no dependency, no network): A4
// pages, text in WinAnsiEncoding — French accents, the euro sign,
// typographic quotes — set in fonts embedded in the file, lines,
// rectangles, and images (the company's logo). Written for this tool from
// ISO 32000-1 (PDF 1.7): a header, numbered objects, a cross-reference
// table and a trailer. Content streams are compressed (Flate). The output
// depends only on what is drawn: the same document gives the same bytes.
//
// Every file is PDF/A-3 (ISO 19005-3, conformance level B), the archival
// PDF the e-invoicing reform's Factur-X is built on: fonts embedded (the
// glyphs used), the sRGB output intent, XMP metadata matching the document
// information, a file identifier; and, for an invoice, its structured data
// attached (factur-x.xml, lib/einvoice.ts) with the Factur-X metadata.
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
  const table = loadFont(font).widths;
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
  // The WinAnsi codes shown in each font: the glyphs the file embeds.
  readonly codes = new Map<FontName, Set<number>>();

  private use(font: FontName, text: string): void {
    this.fonts.add(font);
    let set = this.codes.get(font);
    if (!set) this.codes.set(font, (set = new Set()));
    for (const ch of text.replace(/[\r\n\t]/gu, " ")) set.add(winAnsi(ch));
  }

  text(x: number, y: number, text: string, font: FontName, size: number, fill: Rgb, options: { align?: "left" | "right" | "center"; spacing?: number } = {}): number {
    const w = textWidth(text, font, size) + (options.spacing ?? 0) * Math.max([...text].length - 1, 0);
    const left = options.align === "right" ? x - w : options.align === "center" ? x - w / 2 : x;
    this.use(font, text);
    // Character spacing is part of the graphics state: set every time.
    const tc = `${n(options.spacing ?? 0)} Tc `;
    this.ops.push(`BT /${fontKey(font)} ${n(size)} Tf ${tc}${color(fill)} rg ${n(left)} ${n(A4.height - y)} Td ${literal(text)} Tj ET`);
    return w;
  }

  // A text turned by an angle (degrees), around its start: the draft's mark.
  rotated(x: number, y: number, text: string, font: FontName, size: number, fill: Rgb, degrees: number): void {
    const r = (degrees * Math.PI) / 180;
    const [c, s] = [Math.cos(r), Math.sin(r)];
    this.use(font, text);
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

// A literal string of plain ASCII (file names, dates).
function asciiString(text: string): string {
  return "(" + text.replace(/[^\x20-\x7e]/gu, "_").replace(/([()\\])/gu, "\\$1") + ")";
}

// A moment as the document information writes it (D:20260928103000+00'00')
// and as XMP does (2026-09-28T10:30:00+00:00): the same instant, in UTC.
function pdfDate(date: Date): string {
  return "D:" + date.toISOString().replace(/[-:T]/gu, "").slice(0, 14) + "+00'00'";
}
function xmpDate(date: Date): string {
  return date.toISOString().slice(0, 19) + "+00:00";
}

const xml = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, "");

// A file attached to the document (PDF/A-3 associated file): for an
// invoice, its Factur-X data.
export type Attachment = {
  name: string;
  data: Uint8Array;
  // Its media type, as a PDF name: "text/xml".
  type: string;
  description: string;
  // How it relates to the document (ISO 32000-2 AFRelationship).
  relationship: "Data" | "Source" | "Alternative" | "Supplement";
  // The Factur-X metadata, when it is the invoice's data.
  facturx?: { conformanceLevel: string; version: string };
};

export type Info = { title: string; author: string; subject?: string; creator: string; created: Date; language: string };

const producer = "Chest Quotes PDF writer";

// The XMP metadata packet: PDF/A identification, the document information
// again (it must say the same), and the Factur-X extension schema and
// values when the invoice's data is attached (Factur-X 1.0, § 6.2).
function xmp(info: Info, attachment: Attachment | undefined): string {
  const fx = attachment?.facturx;
  const facturx = fx ? `
  <rdf:Description xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#" rdf:about="">
   <pdfaExtension:schemas>
    <rdf:Bag>
     <rdf:li rdf:parseType="Resource">
      <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
      <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
      <pdfaSchema:prefix>fx</pdfaSchema:prefix>
      <pdfaSchema:property>
       <rdf:Seq>
        <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The name of the embedded XML document</pdfaProperty:description></rdf:li>
        <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The type of the hybrid document in capital letters, e.g. INVOICE or ORDER</pdfaProperty:description></rdf:li>
        <rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The actual version of the standard applying to the embedded XML document</pdfaProperty:description></rdf:li>
        <rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The conformance level of the embedded XML document</pdfaProperty:description></rdf:li>
       </rdf:Seq>
      </pdfaSchema:property>
     </rdf:li>
    </rdf:Bag>
   </pdfaExtension:schemas>
  </rdf:Description>
  <rdf:Description xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#" rdf:about="">
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:DocumentFileName>${xml(attachment!.name)}</fx:DocumentFileName>
   <fx:Version>${xml(fx.version)}</fx:Version>
   <fx:ConformanceLevel>${xml(fx.conformanceLevel)}</fx:ConformanceLevel>
  </rdf:Description>` : "";
  return `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" rdf:about="">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" rdf:about="">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xml(info.title)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${xml(info.author)}</rdf:li></rdf:Seq></dc:creator>${info.subject ? `
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xml(info.subject)}</rdf:li></rdf:Alt></dc:description>` : ""}
  </rdf:Description>
  <rdf:Description xmlns:pdf="http://ns.adobe.com/pdf/1.3/" rdf:about="">
   <pdf:Producer>${producer}</pdf:Producer>
  </rdf:Description>
  <rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" rdf:about="">
   <xmp:CreatorTool>${xml(info.creator)}</xmp:CreatorTool>
   <xmp:CreateDate>${xmpDate(info.created)}</xmp:CreateDate>
   <xmp:ModifyDate>${xmpDate(info.created)}</xmp:ModifyDate>
  </rdf:Description>${facturx}
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

// A six-letter tag naming an embedded subset (ISO 32000-1 § 9.6.4), from
// the glyphs it holds: the same subset, the same tag.
function subsetTag(font: FontName, codes: number[]): string {
  const hash = createHash("sha256").update(font + ":" + codes.join(",")).digest();
  return [...hash.subarray(0, 6)].map(b => String.fromCharCode(65 + (b % 26))).join("");
}

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

  finish(info: Info, attachment?: Attachment): Uint8Array {
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
    // The fonts: each embedded with the glyphs its pages show.
    const fontRefs = new Map<FontName, number>();
    for (const font of Object.keys(fontKeys) as FontName[]) {
      const used = new Set<number>();
      for (const page of this.pages) for (const code of page.codes.get(font) ?? []) used.add(code);
      if (used.size === 0) continue;
      const loaded = loadFont(font);
      const codes = [...used].sort((a, b) => a - b);
      const program = loaded.font.subset(codes.map(code => loaded.font.glyphOf(winAnsiUnicode(code))));
      const name = `${subsetTag(font, codes)}+${loaded.font.metrics.postScriptName}`;
      const m = loaded.font.metrics;
      const fileRef = reserve();
      set(fileRef, stream(`/Length1 ${program.length} /Filter /FlateDecode`, deflateSync(program)));
      const descriptorRef = reserve();
      // Flags: nonsymbolic (32), serif (2), italic (64), fixed pitch (1).
      const flags = 32 + (loaded.serif ? 2 : 0) + (loaded.italic ? 64 : 0) + (m.fixedPitch ? 1 : 0);
      const bbox = m.bbox.map(v => loaded.font.scaled(v)).join(" ");
      set(descriptorRef, `<< /Type /FontDescriptor /FontName /${name} /Flags ${flags} /FontBBox [${bbox}] /ItalicAngle ${n(m.italicAngle)} /Ascent ${loaded.font.scaled(m.ascent)} /Descent ${loaded.font.scaled(m.descent)} /CapHeight ${loaded.font.scaled(m.capHeight)} /StemV ${loaded.bold ? 140 : 80} /FontFile2 ${fileRef} 0 R >>`);
      const ref = reserve();
      set(ref, `<< /Type /Font /Subtype /TrueType /BaseFont /${name} /FirstChar 32 /LastChar 255 /Widths [${loaded.widths.join(" ")}] /Encoding /WinAnsiEncoding /FontDescriptor ${descriptorRef} 0 R >>`);
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
    // PDF/A: the output intent (sRGB), the metadata, and the attached file.
    const profileRef = reserve();
    set(profileRef, stream("/N 3 /Filter /FlateDecode", deflateSync(srgbProfile())));
    const metadataRef = reserve();
    set(metadataRef, stream("/Type /Metadata /Subtype /XML", Buffer.from(xmp(info, attachment), "utf8")));
    let files = "";
    if (attachment) {
      const fileRef = reserve();
      const data = Buffer.from(attachment.data);
      set(fileRef, stream(`/Type /EmbeddedFile /Subtype /${attachment.type.replace("/", "#2F")} /Params << /ModDate ${asciiString(pdfDate(info.created))} /Size ${data.length} /CheckSum <${createHash("md5").update(data).digest("hex")}> >> /Filter /FlateDecode`, deflateSync(data)));
      const specRef = reserve();
      set(specRef, `<< /Type /Filespec /F ${asciiString(attachment.name)} /UF ${infoString(attachment.name)} /Desc ${infoString(attachment.description)} /AFRelationship /${attachment.relationship} /EF << /F ${fileRef} 0 R /UF ${fileRef} 0 R >> >>`);
      files = ` /Names << /EmbeddedFiles << /Names [${asciiString(attachment.name)} ${specRef} 0 R] >> >> /AF [${specRef} 0 R]`;
    }
    set(catalog, `<< /Type /Catalog /Pages ${pagesRef} 0 R /Metadata ${metadataRef} 0 R /OutputIntents [<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB IEC61966-2.1) /Info (sRGB IEC61966-2.1) /DestOutputProfile ${profileRef} 0 R >>]${files} /Lang ${infoString(info.language)} /ViewerPreferences << /DisplayDocTitle true >> >>`);
    set(infoRef, `<< /Title ${infoString(info.title)} /Author ${infoString(info.author)}${info.subject ? ` /Subject ${infoString(info.subject)}` : ""} /Creator ${infoString(info.creator)} /Producer ${infoString(producer)} /CreationDate ${asciiString(pdfDate(info.created))} /ModDate ${asciiString(pdfDate(info.created))} >>`);

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
    // The file identifier: a digest of the file's body (the same document,
    // the same identifier).
    const id = createHash("md5").update(Buffer.concat(chunks)).digest("hex");
    const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n", ...offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
    chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${infoRef} 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${offset}\n%%EOF\n`, "latin1"));
    return new Uint8Array(Buffer.concat(chunks));
  }
}
