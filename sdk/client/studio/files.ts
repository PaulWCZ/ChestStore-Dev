import { ask, chestLink, json, refusal } from "../src/api.js";
import { ChestError, TooLarge, Unavailable } from "../src/errors.js";
import type { FileObject } from "../src/files.js";

// @argentic/chest-sdk/files as the studio publishes it: 0.4.1's module —
// put, get, list, delete, stat, move, url, uploadUrl, every type, the same
// values — and the studio's proposals from the decided storage spec
// (reference/product/specs/tool-storage.md), which the Chest has not built:
// uploads from the public part's visitors, and files published on the
// public host.
export * from "../src/files.js";

// ---- Public uploads (Studio proposal) ------------------------------------------
//
//   // chest.proposals.json — a permission (with "public": true and the
//   // capability files in chest.json):
//   //   "Lets visitors of its public part upload files (10 MiB each at most)."
//   "files": { "publicUploads": true }
//
// A job application's CV, a support request's photo: a visitor of the
// public part, who has no session, sends a file. publicUploadUrl authorises
// one such upload — call it from a public page's action, after the tool's
// own checks of the visitor (a form's guard, visitors.count) — and the
// visitor's browser PUTs the file to url, on the public host
// (/_chest/upload/<token>): 10 MiB at most whatever maxSize says (TooLarge
// beyond), only under uploads/public/, 30 uploads a minute per visitor
// address, the type and content checks of 0.4.1's uploads (type_refused,
// type_mismatch, too_large). The browser's answer is {type, size, claim} —
// never the object's name: the form sends the claim with the rest, and the
// tool's server trades it once with claim(), so a visitor can attach only
// what they sent themselves. With expiresUnclaimedAfter (60 s to 7 days),
// the Chest deletes an upload nobody claimed in that time: no sweep in the
// tool. A private token works only on the team host's route, a public one
// only on the public host's.
//
// Until studio.1 of 0.4.1 it was uploadUrl(name, {public: true}): a public
// upload's address is not the team host's, which 0.4.1's uploadUrl checks,
// so it is a function of its own and 0.4.1's stays exactly as published.
export const publicLimits = { maxSize: 10 << 20, expiresIn: 900, unclaimed: { min: 60, max: 604800 } } as const;
const namePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}(\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}){0,7}$/u;
const typePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,62}\/(\*|[a-z0-9][a-z0-9!#$&^_.+-]{0,62})$/u;
const publicUploadPath = "/_chest/upload/";

export async function publicUploadUrl(name: string, options: { maxSize?: number; types?: string[]; expiresIn?: number; expiresUnclaimedAfter?: number } = {}): Promise<{ url: string; method: "PUT"; expiresIn: number }> {
  if (typeof name !== "string" || !name.startsWith("uploads/public/") || !(name.endsWith("/") ? namePattern.test(name.slice(0, -1)) : namePattern.test(name))) throw new ChestError("invalid_name", 400, "a public upload goes under uploads/public/");
  const { maxSize, types, expiresIn, expiresUnclaimedAfter: unclaimed } = options;
  if (maxSize !== undefined && (typeof maxSize !== "number" || !Number.isSafeInteger(maxSize) || maxSize < 1)) throw new ChestError("invalid_body", 400, "maxSize is a number of bytes");
  if (maxSize !== undefined && maxSize > publicLimits.maxSize) throw new TooLarge();
  if (types !== undefined && (!Array.isArray(types) || types.length > 8 || types.some((t, i) => typeof t !== "string" || t.length > 100 || !typePattern.test(t) || types.indexOf(t) !== i))) throw new ChestError("invalid_type", 400, "invalid media types");
  if (expiresIn !== undefined && (typeof expiresIn !== "number" || !Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > publicLimits.expiresIn)) throw new ChestError("invalid_body", 400, "expiresIn is 1 to 900 seconds");
  if (unclaimed !== undefined && (typeof unclaimed !== "number" || !Number.isInteger(unclaimed) || unclaimed < publicLimits.unclaimed.min || unclaimed > publicLimits.unclaimed.max)) throw new ChestError("invalid_body", 400, "expiresUnclaimedAfter is 60 seconds to 7 days");
  const command = { name, ...(maxSize !== undefined ? { max_size: maxSize } : {}), ...(types !== undefined ? { types } : {}), ...(expiresIn !== undefined ? { expires_in: expiresIn } : {}), ...(unclaimed !== undefined ? { expires_unclaimed_after: unclaimed } : {}) };
  const response = await ask("files", "POST", "/files/public-upload-url", { body: JSON.stringify(command), type: "application/json" });
  if (response.status !== 200) throw await refusal(response, "files");
  const body = (await json(response)) as { url?: unknown; method?: unknown; expires_in?: unknown } | null;
  // On the public host (https), or on the fake Chest's own origin in a test
  // (0.4.1's rule for links, api.ts chestLink).
  const token = body ? chestLink(body.url, publicUploadPath) : undefined;
  if (!body || token === undefined || token.length > 2048 || body.method !== "PUT" || typeof body.expires_in !== "number" || !Number.isInteger(body.expires_in) || body.expires_in < 1 || body.expires_in > publicLimits.expiresIn) throw new Unavailable();
  // A path, not an address: the visitor's browser sends the file to the
  // host it is on — the tool's public host, or the company's own domain
  // once connected (chest.tool.publicUrl) —, whose /_chest/upload/ the
  // Chest serves; an address of another host would be refused by the
  // page's own policy (connect-src 'self').
  return { url: publicUploadPath + token, method: "PUT", expiresIn: body.expires_in };
}

// claim takes a visitor's public upload for the tool, once: the object, as
// stat says it. ChestError not_found when the claim is unknown, already
// used or expired (the Chest deleted the upload).
export async function claim(token: string): Promise<FileObject> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{16,128}\.claim$/u.test(token)) throw new ChestError("not_found", 404, "unknown claim");
  const response = await ask("files", "POST", "/files/claim", { body: JSON.stringify({ claim: token }), type: "application/json" });
  if (response.status !== 200) throw await refusal(response, "files");
  const o = (await json(response)) as Record<string, unknown> | null;
  if (!o || typeof o["name"] !== "string" || !o["name"].startsWith("uploads/public/") || !namePattern.test(o["name"]) || typeof o["type"] !== "string" || o["type"].length > 200 || typeof o["size"] !== "number" || !Number.isSafeInteger(o["size"]) || o["size"] < 0 || typeof o["sha256"] !== "string" || !/^[a-f0-9]{64}$/u.test(o["sha256"]) || typeof o["updated"] !== "string") throw new Unavailable();
  return { name: o["name"], type: o["type"], size: o["size"], sha256: o["sha256"], updated: o["updated"] };
}

// ---- Public files (Studio proposal) --------------------------------------------
//
//   // chest.proposals.json — a permission:
//   //   "Publishes the files it puts under public/ on its public address."
//   "files": { "publicFiles": true }
//
// Objects under public/ are served on the public host at
// /_chest/public/<name>, to anyone, cached an hour: a logo on a public
// page, a published PDF. publicPath is that path (a path of the public host,
// to put in its pages); version (the object's updated time, from stat)
// changes the address when the file changes.
export function publicPath(name: string, options: { version?: string } = {}): string {
  if (typeof name !== "string" || !namePattern.test(name)) throw new ChestError("invalid_name", 400, "invalid file name");
  if (!name.startsWith("public/")) throw new ChestError("invalid_name", 400, "only objects under public/ have a public address");
  const v = options.version === undefined ? "" : "?v=" + encodeURIComponent(options.version);
  return "/_chest/public/" + name.slice("public/".length).split("/").map(encodeURIComponent).join("/") + v;
}
