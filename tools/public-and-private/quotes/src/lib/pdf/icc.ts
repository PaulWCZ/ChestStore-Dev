// The sRGB colour profile a PDF/A file declares as its output intent: the
// colours the document draws (DeviceRGB) are sRGB. Written here from the
// published sRGB definition (IEC 61966-2-1: its primaries adapted to the
// D50 white of the ICC profile connection space, and its tone curve) as an
// ICC version 2 display profile (ICC.1:2001-04) — no file taken from
// anywhere. The same bytes each time.

const s15Fixed16 = (x: number) => Math.round(x * 65536);

function xyz(x: number, y: number, z: number): Buffer {
  const b = Buffer.alloc(20);
  b.write("XYZ ", 0, "latin1");
  b.writeInt32BE(s15Fixed16(x), 8);
  b.writeInt32BE(s15Fixed16(y), 12);
  b.writeInt32BE(s15Fixed16(z), 16);
  return b;
}

function description(text: string): Buffer {
  const ascii = Buffer.from(text + "\0", "latin1");
  const b = Buffer.alloc(12 + ascii.length + 4 + 4 + 2 + 1 + 67);
  b.write("desc", 0, "latin1");
  b.writeUInt32BE(ascii.length, 8);
  ascii.copy(b, 12);
  return b;
}

function textTag(text: string): Buffer {
  return Buffer.concat([Buffer.from("text\0\0\0\0", "latin1"), Buffer.from(text + "\0", "latin1")]);
}

// The sRGB tone curve, sampled on 1,024 points.
function curve(): Buffer {
  const count = 1024;
  const b = Buffer.alloc(12 + 2 * count);
  b.write("curv", 0, "latin1");
  b.writeUInt32BE(count, 8);
  for (let i = 0; i < count; i++) {
    const c = i / (count - 1);
    const linear = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    b.writeUInt16BE(Math.round(linear * 65535), 12 + 2 * i);
  }
  return b;
}

const pad = (b: Buffer) => (b.length % 4 === 0 ? b : Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]));

let cached: Buffer | null = null;

export function srgbProfile(): Buffer {
  if (cached) return cached;
  const trc = curve();
  const tags: [string, Buffer][] = [
    ["desc", description("sRGB IEC61966-2.1")],
    ["cprt", textTag("No copyright, use freely")],
    ["wtpt", xyz(0.9642, 1.0, 0.8249)],
    ["rXYZ", xyz(0.4360747, 0.2225045, 0.0139322)],
    ["gXYZ", xyz(0.3850649, 0.7168786, 0.0971045)],
    ["bXYZ", xyz(0.1430804, 0.0606169, 0.7141733)],
    ["rTRC", trc],
    ["gTRC", trc],
    ["bTRC", trc],
  ];
  const table = Buffer.alloc(4 + 12 * tags.length);
  table.writeUInt32BE(tags.length, 0);
  const bodies: Buffer[] = [];
  const placed = new Map<Buffer, number>();
  let offset = 128 + table.length;
  tags.forEach(([sig, data], i) => {
    let at = placed.get(data);
    if (at === undefined) {
      at = offset;
      placed.set(data, at);
      const padded = pad(data);
      bodies.push(padded);
      offset += padded.length;
    }
    table.write(sig, 4 + 12 * i, "latin1");
    table.writeUInt32BE(at, 8 + 12 * i);
    table.writeUInt32BE(data.length, 12 + 12 * i);
  });
  const header = Buffer.alloc(128);
  header.writeUInt32BE(offset, 0);
  header.writeUInt32BE(0x02100000, 8);
  header.write("mntr", 12, "latin1");
  header.write("RGB ", 16, "latin1");
  header.write("XYZ ", 20, "latin1");
  [2026, 1, 1, 0, 0, 0].forEach((v, i) => header.writeUInt16BE(v, 24 + 2 * i));
  header.write("acsp", 36, "latin1");
  header.writeInt32BE(s15Fixed16(0.9642), 68);
  header.writeInt32BE(s15Fixed16(1.0), 72);
  header.writeInt32BE(s15Fixed16(0.8249), 76);
  cached = Buffer.concat([header, table, ...bodies]);
  return cached;
}
