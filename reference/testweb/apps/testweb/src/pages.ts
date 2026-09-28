import type { Member } from "../../../packages/chest-client/src/member.js";

// The HTML of the tool: plain documents, no inline script or style — the
// public host's policy allows none —, every value escaped.
const title = "Server test bench";

export function escape(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? "");
}

function document(heading: string, body: string, script = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(heading)} — ${title}</title>
<link rel="stylesheet" href="/static/site.css">
${script ? `<script type="module" src="${escape(script)}"></script>\n` : ""}</head>
<body>
<main>
<h1>${escape(heading)}</h1>
${body}
</main>
</body>
</html>
`;
}

// The public part: anyone on the Internet, no identity.
export function publicPage(version: string): string {
  return document(title, `<p>This page is public.</p>
<p class="version">Version: ${escape(version)}</p>
<p><a href="/chest">Team space</a></p>`);
}

// The team part: the member the Chest asserted, their role, the variable the
// tool expects (set in its tab Variables, given at its start), the notes
// (drawn by /chest/app.js) and, for who may write, the form; a photo sent
// straight to the Chest, then shown by its thumbnail.
export function teamPage(version: string, name: string, role: string | null, canWrite: boolean, greeting: string | undefined): string {
  const form = canWrite
    ? `<form id="new-note">
<label for="note">New note</label>
<input id="note" name="text" maxlength="280" autocomplete="off" required>
<button type="submit">Add</button>
</form>
<form id="upload">
<label for="photo">Photo</label>
<input id="photo" name="photo" type="file" accept="image/*" required>
<button type="submit">Upload</button>
</form>`
    : `<p>Read only.</p>`;
  return document("Team notes", `<p>Hello, ${escape(name)}</p>
<p>Your role: ${escape(role ?? "none")}</p>
<p class="version">Version: ${escape(version)}</p>
<p class="variable">TESTWEB_GREETING: ${greeting === undefined ? "not set" : escape(greeting)}</p>
${form}
<p id="status" role="status"></p>
<ul id="notes" aria-label="Notes"></ul>
<ul id="photos" aria-label="Photos"></ul>
<p><a href="/chest/members">Members</a></p>
<p><a href="/">Public part</a></p>`, "/chest/app.js");
}

// The members' page: who has the tool, as the Chest lists them — their name,
// their role, their address when the tool may read it.
export function membersPage(members: Member[]): string {
  const items = members.map(m => `<li data-member="${escape(m.id)}">${escape(m.name)} · ${escape(m.role ?? "no role")}${m.email === undefined ? "" : " · " + escape(m.email)}</li>`).join("\n");
  return document("Members", `<p>${members.length === 1 ? "1 member has" : `${members.length} members have`} this tool.</p>
<ul aria-label="Members">
${items}
</ul>
<p><a href="/chest">Team notes</a></p>`);
}

export function errorPage(heading: string, text: string): string {
  return document(heading, `<p>${escape(text)}</p>`);
}
