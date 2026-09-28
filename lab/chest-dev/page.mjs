// The harness's own page (/_dev): who you are, what the tool sent to the
// Chest (bell, badges, files), and buttons that play the Chest.
const escape = value => String(value ?? "").replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function devPage({ manifest, chest, me, origin, schedulesApi }) {
  const name = id => chest.members.find(m => m.id === id)?.name ?? id;
  const people = chest.members.map(m => `<option value="${m.id}"${m.id === me.id ? " selected" : ""}>${escape(m.name)} — ${escape(m.role ?? "no role")}${m.isAdmin ? " (admin)" : ""}</option>`).join("");
  const bell = chest.notifications.slice().reverse().map(n => `<li><b>${escape(name(n.member))}</b> · ${escape(n.title)}${n.body ? `<br><small>${escape(n.body)}</small>` : ""}<br><a href="${escape(n.path)}">${escape(n.path)}</a>${n.key ? ` <code>${escape(n.key)}</code>` : ""}</li>`).join("") || "<li class=none>Nothing yet.</li>";
  const badges = [...chest.badges].map(([id, count]) => `<li>${escape(name(id))}: <b>${count}</b></li>`).join("") || "<li class=none>None.</li>";
  const files = [...chest.files].map(([n, f]) => `<li><code>${escape(n)}</code> ${escape(f.type)} · ${f.data.byteLength} B</li>`).join("") || "<li class=none>None.</li>";
  const schedules = (chest.schedules ?? []).map(s => {
    const next = schedulesApi?.nextRun(s.cron, new Date(), process.env["CHEST_TIMEZONE"] ?? "Europe/Paris");
    return `<li><form method="post" action="/_dev/schedule"><input type="hidden" name="name" value="${escape(s.name)}"><b>${escape(s.name)}</b> <code>${escape(s.cron)}</code> — ${escape(schedulesApi?.describeCron(s.cron) ?? "")}, next ${escape(next ? next.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never")} <button>Run now</button></form></li>`;
  }).join("");
  const runs = (chest.runs ?? []).slice(-8).reverse().map(r => `<li><code>${escape(r.name)}</code> ${escape(r.scheduledAt.slice(0, 16))} → ${r.status}</li>`).join("");
  const extra = schedules ? `<section><h2>Schedules (proposal)</h2><ul>${schedules}</ul>${runs ? `<p>Last runs:</p><ul>${runs}</ul>` : ""}</section>` : "";
  const events = chest.members.map(m => `<option value="${m.id}">${escape(m.name)}</option>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>chest dev · ${escape(manifest.title ?? manifest.name)}</title>
<style>
body{font:15px/1.5 ui-monospace,Menlo,monospace;margin:0;background:#101418;color:#e8edf2}
main{max-width:1100px;margin:auto;padding:24px;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
header{padding:16px 24px;border-bottom:1px solid #2a3440;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
h1{font-size:18px;margin:0}h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#8fa3b8;margin:0 0 8px}
section{background:#161d24;border:1px solid #2a3440;border-radius:10px;padding:16px}
a{color:#7cc4ff}ul{margin:0;padding-left:18px}li{margin:4px 0}.none{color:#6b7c8d;list-style:none;margin-left:-18px}
select,button,input{font:inherit;background:#0c1014;color:inherit;border:1px solid #2a3440;border-radius:6px;padding:6px 8px}button{cursor:pointer;background:#1f6feb;border-color:#1f6feb}
form{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 8px}code{color:#ffb86b}
</style></head><body>
<header><h1>chest dev · ${escape(manifest.title ?? manifest.name)}</h1><a href="/chest">Open /chest</a><a href="/">Public part</a><span style="margin-left:auto;color:#8fa3b8">${escape(origin)}</span></header>
<main>
<section><h2>You are</h2>
<form method="post" action="/_dev/as"><select name="member">${people}</select>
<select name="locale"><option value="">their language (${escape(me.locale ?? "en")})</option><option value="en"${me.locale === "en" ? "" : ""}>English</option><option value="fr">Français</option></select>
<input type="hidden" name="back" value="/_dev"><button>Switch</button></form>
<p>Signed in as <b>${escape(me.name)}</b>, role <code>${escape(me.role ?? "none")}</code>, language <code>${escape(me.locale ?? "en")}</code>. Roles of the tool: ${(manifest.roles ?? []).map(r => `<code>${escape(r)}</code>`).join(" ")}.</p></section>
<section><h2>Bell (notifications)</h2><form method="post" action="/_dev/clear"><button>Clear</button></form><ul>${bell}</ul></section>
<section><h2>Badges</h2><ul>${badges}</ul></section>
<section><h2>Files</h2><ul>${files}</ul></section>
<section><h2>Members' lifecycle</h2>
<form method="post" action="/_dev/event"><select name="member">${events}</select><select name="type"><option>member.updated</option><option>access.revoked</option><option>member.removed</option><option>member.erased</option></select><button>Send event</button></form>
<p>Removed or erased members leave the fake Chest. Acknowledged erasures: ${chest.acknowledged.map(a => `<code>${escape(a)}</code>`).join(" ") || "none"}.</p></section>
${extra}
</main></body></html>`;
}
