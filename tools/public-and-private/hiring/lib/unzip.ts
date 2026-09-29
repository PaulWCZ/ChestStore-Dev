// Safe in the browser: no SDK here.
// Reading the files of a ZIP in the browser (an export's CVs), with the
// platform's own decompression (DecompressionStream "deflate-raw"): the
// central directory says where each file is; stored and deflated files
// are read, anything else is skipped. No dependency.

export type Unzipped = { name: string; data: Uint8Array };

export async function unzip(bytes: Uint8Array, keep: (name: string) => boolean = () => true, maxFiles = 2000): Promise<Unzipped[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end of central directory record: its signature, from the end.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out: Unzipped[] = [];
  const decoder = new TextDecoder();
  for (let n = 0; n < count && n < maxFiles; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extra + comment;
    if (name.endsWith("/") || !keep(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const body = bytes.subarray(start, start + packed);
    if (method === 0) out.push({ name, data: body.slice() });
    else if (method === 8) out.push({ name, data: new Uint8Array(await new Response(new Blob([body.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()) });
  }
  return out;
}
