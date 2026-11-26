import { ChestError } from "../src/errors.js";

// @argentic/chest-sdk/files as the studio publishes it (0.7.0-studio.N):
// 0.7.0's module — put, get, stat, list, move, delete, url, uploadUrl (a
// visitor's upload with {public: true}), every type, the same values — and
// the studio's proposal from the decided storage spec
// (reference/product/specs/tool-storage.md) that 0.7.0 does not give:
// files published on the public host.
//
// What 0.7.0 now gives, the studio dropped: publicUploadUrl and claim, and
// with them publicLimits and "files": {"publicUploads"} in
// chest.proposals.json. A visitor's upload is 0.7.0's uploadUrl("folder/",
// {public: true, types, maxSize}) from a public route: the Chest names the
// file (20 hex characters), the browser hands the name back with the form,
// and the tool stats it before recording it. 0.7.0 has no
// expiresUnclaimedAfter: a tool deletes what no form recorded itself (a
// schedule).
export * from "../src/files.js";

const namePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}(\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}){0,7}$/u;

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
