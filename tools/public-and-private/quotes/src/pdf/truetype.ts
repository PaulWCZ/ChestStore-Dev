// Reading a TrueType font (the tables a PDF needs) and making the subset a
// document embeds. Written for this tool from the OpenType specification
// (https://learn.microsoft.com/typography/opentype/spec/, tables head,
// hhea, maxp, hmtx, loca, glyf, cmap format 4, OS/2, post, name) and ISO
// 32000-1 § 9.9 (embedded font programs). No dependency.
//
// The subset keeps every table a PDF reader needs and every glyph id as it
// was: the glyphs a document does not use are emptied (their outline
// dropped, their place kept), so the font's own character map still
// finds each glyph the document shows, and the file is a fraction of the
// font's size. The same glyphs give the same bytes.

export type Metrics = {
  unitsPerEm: number;
  bbox: [number, number, number, number];
  ascent: number;
  descent: number;
  capHeight: number;
  italicAngle: number;
  weight: number;
  fixedPitch: boolean;
  postScriptName: string;
};

type Table = { offset: number; length: number };

export class TrueType {
  readonly data: Buffer;
  readonly tables = new Map<string, Table>();
  readonly metrics: Metrics;
  readonly glyphCount: number;
  private readonly advances: number[];
  private readonly cmap: Map<number, number>;
  private readonly longLoca: boolean;

  constructor(bytes: Uint8Array) {
    this.data = Buffer.from(bytes);
    const d = this.data;
    const version = d.readUInt32BE(0);
    if (version !== 0x00010000 && version !== 0x74727565) throw new Error("not a TrueType font");
    const count = d.readUInt16BE(4);
    for (let i = 0; i < count; i++) {
      const at = 12 + 16 * i;
      this.tables.set(d.toString("latin1", at, at + 4), { offset: d.readUInt32BE(at + 8), length: d.readUInt32BE(at + 12) });
    }
    for (const needed of ["head", "hhea", "maxp", "hmtx", "loca", "glyf", "cmap"]) if (!this.tables.has(needed)) throw new Error("font without " + needed);
    const head = this.table("head");
    const unitsPerEm = d.readUInt16BE(head + 18);
    this.longLoca = d.readInt16BE(head + 50) === 1;
    this.glyphCount = d.readUInt16BE(this.table("maxp") + 4);
    const hhea = this.table("hhea");
    const metricsCount = d.readUInt16BE(hhea + 34);
    const hmtx = this.table("hmtx");
    this.advances = [];
    for (let g = 0; g < this.glyphCount; g++) this.advances.push(d.readUInt16BE(hmtx + 4 * Math.min(g, metricsCount - 1)));
    this.cmap = this.readCmap();
    const os2 = this.tables.get("OS/2");
    const post = this.tables.get("post");
    this.metrics = {
      unitsPerEm,
      bbox: [d.readInt16BE(head + 36), d.readInt16BE(head + 38), d.readInt16BE(head + 40), d.readInt16BE(head + 42)],
      ascent: d.readInt16BE(hhea + 4),
      descent: d.readInt16BE(hhea + 6),
      capHeight: os2 && os2.length >= 90 ? d.readInt16BE(os2.offset + 88) : d.readInt16BE(hhea + 4),
      italicAngle: post ? d.readInt32BE(post.offset + 4) / 65536 : 0,
      weight: os2 ? d.readUInt16BE(os2.offset + 4) : 400,
      fixedPitch: post ? d.readUInt32BE(post.offset + 12) !== 0 : false,
      postScriptName: this.readName(6) ?? "Font",
    };
  }

  private table(tag: string): number {
    return this.tables.get(tag)!.offset;
  }

  // The Unicode → glyph map of the (3,1) subtable, format 4 (the Basic
  // Multilingual Plane: every character a WinAnsi document shows).
  private readCmap(): Map<number, number> {
    const d = this.data;
    const cmap = this.table("cmap");
    const count = d.readUInt16BE(cmap + 2);
    let sub = -1;
    for (let i = 0; i < count; i++) {
      const platform = d.readUInt16BE(cmap + 4 + 8 * i);
      const encoding = d.readUInt16BE(cmap + 6 + 8 * i);
      const offset = d.readUInt32BE(cmap + 8 + 8 * i);
      if (platform === 3 && encoding === 1 && d.readUInt16BE(cmap + offset) === 4) sub = cmap + offset;
    }
    if (sub < 0) throw new Error("font without a Unicode character map");
    const segments = d.readUInt16BE(sub + 6) / 2;
    const ends = sub + 14;
    const starts = ends + 2 * segments + 2;
    const deltas = starts + 2 * segments;
    const ranges = deltas + 2 * segments;
    const map = new Map<number, number>();
    for (let s = 0; s < segments; s++) {
      const end = d.readUInt16BE(ends + 2 * s);
      const start = d.readUInt16BE(starts + 2 * s);
      const delta = d.readInt16BE(deltas + 2 * s);
      const range = d.readUInt16BE(ranges + 2 * s);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let glyph: number;
        if (range === 0) glyph = (c + delta) & 0xffff;
        else {
          const at = ranges + 2 * s + range + 2 * (c - start);
          glyph = d.readUInt16BE(at);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph !== 0) map.set(c, glyph);
      }
    }
    return map;
  }

  private readName(id: number): string | null {
    const table = this.tables.get("name");
    if (!table) return null;
    const d = this.data;
    const count = d.readUInt16BE(table.offset + 2);
    const strings = table.offset + d.readUInt16BE(table.offset + 4);
    for (let i = 0; i < count; i++) {
      const at = table.offset + 6 + 12 * i;
      const [platform, , , nameId, length, offset] = [0, 2, 4, 6, 8, 10].map(k => d.readUInt16BE(at + k)) as [number, number, number, number, number, number];
      if (nameId !== id) continue;
      const raw = d.subarray(strings + offset, strings + offset + length);
      if (platform === 3 || platform === 0) {
        let text = "";
        for (let k = 0; k + 1 < raw.length; k += 2) text += String.fromCharCode(raw.readUInt16BE(k));
        return text.replace(/[^\x21-\x7e]/gu, "");
      }
      return raw.toString("latin1").replace(/[^\x21-\x7e]/gu, "");
    }
    return null;
  }

  // The glyph of a character (0, the "missing" glyph, when it has none).
  glyphOf(codePoint: number): number {
    return this.cmap.get(codePoint) ?? 0;
  }

  // A glyph's advance width in thousandths of an em, as PDF widths are.
  width(glyph: number): number {
    return Math.round(((this.advances[glyph] ?? 0) * 1000) / this.metrics.unitsPerEm);
  }

  // In thousandths of an em.
  scaled(value: number): number {
    return Math.round((value * 1000) / this.metrics.unitsPerEm);
  }

  private glyphRange(glyph: number): [number, number] {
    const loca = this.table("loca");
    const d = this.data;
    return this.longLoca
      ? [d.readUInt32BE(loca + 4 * glyph), d.readUInt32BE(loca + 4 * glyph + 4)]
      : [d.readUInt16BE(loca + 2 * glyph) * 2, d.readUInt16BE(loca + 2 * glyph + 2) * 2];
  }

  // The glyphs a composite glyph is drawn from.
  private components(glyph: number): number[] {
    const [start, end] = this.glyphRange(glyph);
    if (end - start < 10) return [];
    const d = this.data;
    const at = this.table("glyf") + start;
    if (d.readInt16BE(at) >= 0) return [];
    const out: number[] = [];
    let p = at + 10;
    for (;;) {
      const flags = d.readUInt16BE(p);
      out.push(d.readUInt16BE(p + 2));
      p += 4 + (flags & 0x0001 ? 4 : 2);
      if (flags & 0x0008) p += 2;
      else if (flags & 0x0040) p += 4;
      else if (flags & 0x0080) p += 8;
      if (!(flags & 0x0020)) break;
    }
    return out;
  }

  // subset: the font with only these glyphs drawn (and glyph 0, and the
  // glyphs composite ones need); the others empty, their ids kept.
  subset(used: Iterable<number>): Buffer {
    const keep = new Set<number>([0]);
    const queue = [...used];
    while (queue.length > 0) {
      const g = queue.pop()!;
      if (g < 0 || g >= this.glyphCount || keep.has(g)) continue;
      keep.add(g);
      queue.push(...this.components(g));
    }
    const d = this.data;
    const glyf = this.table("glyf");
    const parts: Buffer[] = [];
    const loca = Buffer.alloc(4 * (this.glyphCount + 1));
    let offset = 0;
    for (let g = 0; g < this.glyphCount; g++) {
      loca.writeUInt32BE(offset, 4 * g);
      if (!keep.has(g)) continue;
      const [start, end] = this.glyphRange(g);
      if (end <= start) continue;
      const bytes = d.subarray(glyf + start, glyf + end);
      const padded = bytes.length % 4 === 0 ? bytes : Buffer.concat([bytes, Buffer.alloc(4 - (bytes.length % 4))]);
      parts.push(padded);
      offset += padded.length;
    }
    loca.writeUInt32BE(offset, 4 * this.glyphCount);
    const tables = new Map<string, Buffer>();
    for (const tag of ["cmap", "cvt ", "fpgm", "hhea", "hmtx", "maxp", "OS/2", "prep", "name"]) {
      const t = this.tables.get(tag);
      if (t) tables.set(tag, Buffer.from(d.subarray(t.offset, t.offset + t.length)));
    }
    tables.set("glyf", Buffer.concat(parts));
    tables.set("loca", loca);
    const head = Buffer.from(d.subarray(this.table("head"), this.table("head") + 54));
    head.writeInt16BE(1, 50); // long offsets
    head.writeUInt32BE(0, 8); // checkSumAdjustment, set below
    tables.set("head", head);
    // post, version 3: the glyph names are not needed to show the glyphs.
    const post = this.tables.get("post");
    if (post) {
      const p = Buffer.from(d.subarray(post.offset, post.offset + 32));
      p.writeUInt32BE(0x00030000, 0);
      tables.set("post", p);
    }
    return assemble(tables);
  }
}

function checksum(data: Buffer): number {
  let sum = 0;
  const padded = data.length % 4 === 0 ? data : Buffer.concat([data, Buffer.alloc(4 - (data.length % 4))]);
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

// A font file from its tables: the table directory in tag order, each
// table on four bytes, and the head's checksum adjustment.
function assemble(tables: Map<string, Buffer>): Buffer {
  const tags = [...tables.keys()].sort();
  const count = tags.length;
  let power = 1;
  let log = 0;
  while (power * 2 <= count) {
    power *= 2;
    log++;
  }
  const header = Buffer.alloc(12 + 16 * count);
  header.writeUInt32BE(0x00010000, 0);
  header.writeUInt16BE(count, 4);
  header.writeUInt16BE(power * 16, 6);
  header.writeUInt16BE(log, 8);
  header.writeUInt16BE(count * 16 - power * 16, 10);
  const bodies: Buffer[] = [];
  let offset = header.length;
  tags.forEach((tag, i) => {
    const data = tables.get(tag)!;
    const at = 12 + 16 * i;
    header.write(tag, at, 4, "latin1");
    header.writeUInt32BE(checksum(data), at + 4);
    header.writeUInt32BE(offset, at + 8);
    header.writeUInt32BE(data.length, at + 12);
    const padded = data.length % 4 === 0 ? data : Buffer.concat([data, Buffer.alloc(4 - (data.length % 4))]);
    bodies.push(padded);
    offset += padded.length;
  });
  const font = Buffer.concat([header, ...bodies]);
  const headAt = 12 + 16 * tags.indexOf("head");
  const headOffset = font.readUInt32BE(headAt + 8);
  font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, headOffset + 8);
  return font;
}
