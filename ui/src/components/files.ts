// Files chosen in a FilePicker: what may be added (type, size, count), how
// big a file reads in the tool's language, and the browser's upload with
// progress. Checking here is for the person (a clear message at once);
// the server checks again and sniffs the bytes — that is the tool's job.
import { fill } from "./text.js";
import { en, type FileWords } from "./words.js";

export type FileLike = { readonly name: string; readonly size: number; readonly type: string };

export type FileRules = {
  // MIME types ("application/pdf"), families ("image/*") or extensions
  // (".pdf"); empty or absent: every kind.
  readonly accept?: readonly string[];
  // Bytes, per file.
  readonly maxSize?: number;
  // Files in all (those already chosen count).
  readonly maxFiles?: number;
};

export type Refusal = { readonly file: FileLike; readonly reason: "too_big" | "wrong_type" | "too_many" };

export function accepts(file: FileLike, accept: readonly string[] | undefined): boolean {
  if (!accept || accept.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return accept.some(rule => {
    const r = rule.trim().toLowerCase();
    if (r.startsWith(".")) return name.endsWith(r);
    if (r.endsWith("/*")) return type.startsWith(r.slice(0, -1));
    return type === r;
  });
}

// checkFiles sorts what was chosen into what may be added and what is
// refused (with the reason), keeping the order they were chosen in.
export function checkFiles<F extends FileLike>(already: number, chosen: readonly F[], rules: FileRules): { accepted: F[]; refused: Refusal[] } {
  const accepted: F[] = [];
  const refused: Refusal[] = [];
  let room = rules.maxFiles === undefined ? Infinity : rules.maxFiles - already;
  for (const file of chosen) {
    if (!accepts(file, rules.accept)) refused.push({ file, reason: "wrong_type" });
    else if (rules.maxSize !== undefined && file.size > rules.maxSize) refused.push({ file, reason: "too_big" });
    else if (room <= 0) refused.push({ file, reason: "too_many" });
    else {
      accepted.push(file);
      room--;
    }
  }
  return { accepted, refused };
}

// fileSize: "340 KB", "1.4 MB" / "1,4 Mo" — from the words, never Intl.
export function fileSize(bytes: number, words: Pick<FileWords, "units" | "decimal">): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < 3) {
    value /= 1024;
    unit++;
  }
  const text = unit === 0 || value >= 10 ? String(Math.round(value)) : (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/u, "");
  return `${text.replace(".", words.decimal)} ${words.units[unit]}`;
}

// The name people know a type by — its usual extension — for MIME types
// (0.2.2: vCard's three MIME spellings are one VCF, OpenDocument's are
// ODT/ODS/ODP, JPEG is JPG).
const mimeNames: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg", "image/pjpeg": "jpg", "image/svg+xml": "svg", "image/tiff": "tif", "image/heif": "heic",
  "text/plain": "txt", "text/vcard": "vcf", "text/x-vcard": "vcf", "text/directory": "vcf", "text/calendar": "ics", "text/markdown": "md", "text/csv": "csv", "text/html": "html",
  "application/msword": "doc", "application/vnd.ms-excel": "xls", "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.oasis.opendocument.text": "odt", "application/vnd.oasis.opendocument.spreadsheet": "ods", "application/vnd.oasis.opendocument.presentation": "odp",
  "application/zip": "zip", "application/x-zip-compressed": "zip", "application/json": "json", "application/rtf": "rtf", "message/rfc822": "eml",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-wav": "wav", "video/quicktime": "mov", "video/x-msvideo": "avi",
};
// Extensions written two ways: one name.
const sameAs: Readonly<Record<string, string>> = { jpeg: "jpg", jpe: "jpg", tiff: "tif", heif: "heic", vcard: "vcf", htm: "html", markdown: "md", mpeg: "mpg" };
// The extensions a family ("image/*") already says.
const familyOf: Readonly<Record<string, readonly string[]>> = {
  image: ["jpg", "png", "gif", "webp", "heic", "avif", "bmp", "tif", "svg"],
  audio: ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus"],
  video: ["mp4", "mov", "webm", "mkv", "avi", "m4v", "mpg"],
  text: ["txt", "csv", "md", "html", "ics", "vcf"],
};

const extensionOf = (rule: string): string | null => {
  const r = rule.trim().toLowerCase();
  if (r.startsWith(".")) return sameAs[r.slice(1)] ?? r.slice(1);
  if (r.endsWith("/*")) return null;
  if (mimeNames[r]) return mimeNames[r]!;
  // Another MIME type: its last word, without x- or vnd. and a trailing
  // "-compressed" ("application/x-7z-compressed" → 7Z).
  const sub = (r.split("/")[1] ?? r).replace(/^(x-|vnd\.)/u, "").split(/[.+]/u).filter(Boolean);
  const last = sub[sub.length - 1] ?? r;
  return sameAs[last] ?? last.replace(/-compressed$/u, "");
};

// acceptText: the accepted kinds as a person reads them ("images, PDF",
// « images, PDF ») — families in words (the words' `kinds`, the kit's
// English by default), MIME types by their usual extension, each name once
// (JPG and JPEG are one), and nothing a family already says (".png" beside
// "image/*").
export function acceptText(accept: readonly string[] | undefined, words: Pick<FileWords, "kinds"> = en.files): string {
  if (!accept || accept.length === 0) return "";
  const kinds = words.kinds ?? en.files.kinds!;
  const families = new Set(accept.map(a => a.trim().toLowerCase()).filter(r => r.endsWith("/*")).map(r => r.slice(0, -2)));
  const covered = new Set([...families].flatMap(f => familyOf[f] ?? []));
  const names = accept.flatMap(a => {
    const r = a.trim().toLowerCase();
    if (r.endsWith("/*")) {
      const family = r.slice(0, -2);
      return [family in kinds ? kinds[family as keyof typeof kinds] : family];
    }
    const ext = extensionOf(r);
    if (!ext || covered.has(ext)) return [];
    return [ext.toUpperCase()];
  });
  return [...new Set(names)].join(", ");
}

export function refusalText(refusal: Refusal, words: FileWords, rules: FileRules): string {
  const values = { name: refusal.file.name, size: fileSize(rules.maxSize ?? 0, words), count: String(rules.maxFiles ?? 0) };
  return fill(refusal.reason === "too_big" ? words.tooBig : refusal.reason === "wrong_type" ? words.wrongType : words.tooMany, values);
}

export type Progress = (fraction: number) => void;

// putWithProgress sends a file straight to where the Chest said (a signed
// uploadUrl: the browser PUTs, the tool never holds the bytes) and reports
// progress — fetch cannot report an upload's progress, XMLHttpRequest can.
// Resolves with the answer's status and text; rejects on a network error or
// when `signal` aborts. Browser only.
export function putWithProgress(url: string, body: Blob, { method = "PUT", headers = {}, onProgress, signal }: { method?: string; headers?: Record<string, string>; onProgress?: Progress; signal?: AbortSignal } = {}): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (onProgress) xhr.upload.onprogress = e => { if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total); };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    if (signal) {
      if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(body);
  });
}
