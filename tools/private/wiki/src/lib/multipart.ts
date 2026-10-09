// The import's form (multipart/form-data, as the browser's FormData sends
// it), read from the body's bytes without copying them: each file is a
// view of the body (the tool's memory holds the upload once — 256 MiB a
// tool on a Chest). Only what the importer sends: fields and files, each
// part's name and file name from its Content-Disposition.

export type Part = { name: string; fileName: string | null; data: Uint8Array };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// The boundary of a Content-Type, or null when it is not a form.
export function boundaryOf(contentType: string | null | undefined): string | null {
  if (!contentType || !/^multipart\/form-data\b/iu.test(contentType)) return null;
  const m = /;\s*boundary=(?:"([^"]{1,70})"|([^\s;]{1,70}))/iu.exec(contentType);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function indexOf(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  const first = needle[0]!;
  for (let i = haystack.indexOf(first, from); i !== -1 && i <= haystack.length - needle.length; i = haystack.indexOf(first, i + 1)) {
    let k = 1;
    while (k < needle.length && haystack[i + k] === needle[k]) k++;
    if (k === needle.length) return i;
  }
  return -1;
}

// parts of a body; null when it is not a well-formed form.
export function parseMultipart(body: Uint8Array, boundary: string, maxParts = 1000): Part[] | null {
  const delimiter = encoder.encode(`--${boundary}`);
  const parts: Part[] = [];
  let at = indexOf(body, delimiter, 0);
  if (at === -1) return null;
  for (;;) {
    at += delimiter.length;
    // "--" after a delimiter: the end.
    if (body[at] === 0x2d && body[at + 1] === 0x2d) return parts;
    if (body[at] === 0x0d && body[at + 1] === 0x0a) at += 2;
    else return null;
    const headersEnd = indexOf(body, encoder.encode("\r\n\r\n"), at);
    if (headersEnd === -1 || headersEnd - at > 8192) return null;
    const headers = decoder.decode(body.subarray(at, headersEnd));
    const start = headersEnd + 4;
    const next = indexOf(body, encoder.encode(`\r\n--${boundary}`), start);
    if (next === -1) return null;
    const disposition = /^content-disposition:\s*form-data(.*)$/imu.exec(headers)?.[1] ?? "";
    const name = /;\s*name="([^"]*)"/iu.exec(disposition)?.[1];
    const fileName = /;\s*filename\*=UTF-8''([^;\s]+)/iu.exec(disposition)?.[1] ?? /;\s*filename="([^"]*)"/iu.exec(disposition)?.[1] ?? null;
    if (name === undefined) return null;
    let decodedName = fileName;
    try {
      if (fileName !== null && /%[0-9a-f]{2}/iu.test(fileName) && /filename\*=/iu.test(disposition)) decodedName = decodeURIComponent(fileName);
    } catch {
      decodedName = fileName;
    }
    parts.push({ name, fileName: decodedName, data: body.subarray(start, next) });
    if (parts.length > maxParts) return null;
    at = next + 2;
  }
}
