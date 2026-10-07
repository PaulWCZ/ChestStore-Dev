import { request } from "node:http";
import { QuotaExceeded } from "../../../packages/chest-client/src/errors.js";
import * as files from "../../../packages/chest-client/src/files.js";
import type { FileData, FileObject, FilePage } from "../../../packages/chest-client/src/files.js";

// The files of the tool — the capability files of its manifest —, kept by
// its Chest through the SDK (files.ts), never on the container's disk.
export type QuotaProbe = { tooLarge: number; quota: string; written: number };

export type UploadOptions = { maxSize?: number; types?: string[]; expiresIn?: number; public?: boolean };
export type LinkOptions = { thumbnail?: 256 | 1024; download?: boolean };

export interface Files {
  put(name: string, data: Uint8Array, type: string): Promise<FileObject>;
  get(name: string): Promise<FileData | null>;
  stat(name: string): Promise<FileObject | null>;
  list(): Promise<FilePage>;
  remove(name: string): Promise<boolean>;
  url(name: string, options?: LinkOptions): Promise<{ url: string; expiresIn: number }>;
  // uploadUrl authorises one upload of a member's browser — or, public, of a
  // visitor's —, straight to the Chest (never through this container).
  uploadUrl(name: string, options?: UploadOptions): Promise<{ url: string; method: "PUT"; expiresIn: number }>;
  // quotaProbe has the Chest refuse what goes beyond its bounds — what the
  // laboratory's proof reads — and removes what it wrote.
  quotaProbe(): Promise<QuotaProbe>;
}

const maxObject = 32 << 20;
// The probe writes 1 MiB at a time, 64 MiB at most: the quota of the
// laboratory (tool_files_lab) is reached before; a real one is not.
const probeChunk = 1 << 20;
const probeMax = 64;

// tooLarge asks the Chest itself to keep one byte more than an object may
// have — the SDK would refuse it before sending — and answers its status.
// Expect: 100-continue: the body is sent only if the Chest asks for it; it
// answers 413 at once.
function tooLarge(): Promise<number> {
  return new Promise((resolve) => {
    const api = new URL(process.env["CHEST_API"] ?? "http://127.0.0.1:1");
    const req = request({ host: api.hostname, port: api.port, method: "PUT", path: "/files/probe/too-large", headers: { "Content-Length": String(maxObject + 1), Expect: "100-continue" }, timeout: 30000 }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
      req.destroy();
    });
    req.on("continue", () => req.end(Buffer.alloc(maxObject + 1)));
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(0));
  });
}

export class ChestFiles implements Files {
  put(name: string, data: Uint8Array, type: string): Promise<FileObject> { return files.put(name, data, type); }
  get(name: string): Promise<FileData | null> { return files.get(name); }
  stat(name: string): Promise<FileObject | null> { return files.stat(name); }
  list(): Promise<FilePage> { return files.list(); }
  remove(name: string): Promise<boolean> { return files.delete(name); }
  url(name: string, options: LinkOptions = {}): Promise<{ url: string; expiresIn: number }> { return files.url(name, options); }
  uploadUrl(name: string, options: UploadOptions = {}): Promise<{ url: string; method: "PUT"; expiresIn: number }> { return files.uploadUrl(name, options); }
  async quotaProbe(): Promise<QuotaProbe> {
    const status = await tooLarge();
    let written = 0;
    let quota = "not_reached";
    try {
      for (; written < probeMax; written++) await files.put(`probe/${written}`, new Uint8Array(probeChunk));
    } catch (error) {
      if (!(error instanceof QuotaExceeded)) throw error;
      quota = error.code;
    } finally {
      for (let i = 0; i < written; i++) await files.delete(`probe/${i}`);
    }
    return { tooLarge: status, quota, written };
  }
}
