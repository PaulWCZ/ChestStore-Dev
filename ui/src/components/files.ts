// Files chosen in a FilePicker: what may be added (type, size, count), how
// big a file reads in the tool's language, and the browser's upload with
// progress. Checking here is for the person (a clear message at once);
// the server checks again and sniffs the bytes — that is the tool's job.
import { fill } from "./text.js";
import type { FileWords } from "./words.js";

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

// acceptText: the accepted kinds as a person reads them ("PDF, JPG, PNG").
export function acceptText(accept: readonly string[] | undefined): string {
  if (!accept || accept.length === 0) return "";
  const names = accept.map(a => {
    const r = a.trim().toLowerCase();
    if (r.startsWith(".")) return r.slice(1).toUpperCase();
    if (r.endsWith("/*")) return r.slice(0, -2);
    const sub = r.split("/")[1] ?? r;
    return ({ jpeg: "JPG", "svg+xml": "SVG", plain: "TXT", "vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX", "vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX", msword: "DOC" } as Record<string, string>)[sub] ?? sub.toUpperCase();
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
