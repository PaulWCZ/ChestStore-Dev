// The harness's own page (/_dev): who you are, what the tool sent to the
// Chest (bell, badges, files), and buttons that play the Chest.
const escape = value => String(value ?? "").replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// The look's switcher (Proposal (studio): chest.theme()): the owner's two
// levels, as the Chest's admin would offer them.
function lookPanel(manifest, chest, catalogue, sampleBrand) {
  const valueOf = c => (!c ? "" : c.mode === "own" ? "own" : c.mode === "brand" ? (c.brand?.name === "Café du Port" ? "brand:port" : "brand:sample") : `catalogue:${c.theme}`);
  const all = valueOf(chest.theme.all) || "own";
  const mine = chest.theme.tools[manifest.name];
  const tool = mine ? valueOf(mine) : "inherit";
  const options = (current, first) => [
    ...first,
    ["own", "Each tool's own look"],
    ...catalogue.map(t => [`catalogue:${t.id}`, `Theme: ${t.name.en}${t.tool ? ` (from ${t.tool})` : ""}${t.modes === "light" ? " — light only" : ""}`]),
    ["brand:sample", `Brand: ${sampleBrand.name}`],
    ["brand:port", "Brand: Café du Port"],
  ].map(([v, label]) => `<option value="${escape(v)}"${v === current ? " selected" : ""}>${escape(label)}</option>`).join("");
  const effective = mine ? `this tool's override (${escape(tool)})` : chest.theme.all ? `the choice for all tools (${escape(all)})` : "the tool's own identity (the Chest says nothing)";
  return `<section><h2>Look (proposal)</h2>
<form method="post" action="/_dev/theme"><input type="hidden" name="level" value="all"><input type="hidden" name="back" value="/_dev"><label>All tools <select name="choice">${options(all, [])}</select></label><button>Set</button></form>
<form method="post" action="/_dev/theme"><input type="hidden" name="level" value="tool"><input type="hidden" name="back" value="/_dev"><label>This tool (${escape(manifest.name)}) <select name="choice">${options(tool, [["inherit", "Same as all tools"]])}</select></label><button>Set</button></form>
<p>Now: ${effective}. A page shows it at its next load (the tool asks <code>chest.theme()</code>).</p></section>`;
}

// Webhooks (Proposal (studio)): the targets the tool added, the deliveries
// the Chest made (the journal the owner reads), and buttons that make a
// target fail and play the retries. Nothing leaves this machine.
function webhooksPanelOf(chest, proposals) {
  const hooks = chest.webhooks ?? { targets: [], deliveries: [], events: [] };
  const targets = hooks.targets.map(t => `<li><b>${escape(t.label)}</b> <code>${escape(t.kind)}</code> ${escape(t.url)}<br><small>${escape(t.state)}${t.status ? ` · last: ${escape(t.status)}` : ""}${t.lastError ? ` · <code>${escape(t.lastError)}</code>` : ""} · ${t.failures} failure${t.failures === 1 ? "" : "s"} in a row</small><form method="post" action="/_dev/webhook"><input type="hidden" name="target" value="${escape(t.id)}"><button name="action" value="fail">Answer 503</button> <button name="action" value="timeout">Time out</button> <button name="action" value="ok">Answer 200</button></form></li>`).join("");
  const deliveries = hooks.deliveries.slice(-12).reverse().map(d => `<li><code>${escape(d.event)}</code> → ${escape(hooks.targets.find(t => t.id === d.target)?.label ?? d.target)}: <b>${escape(d.status)}</b> (${d.attempts} attempt${d.attempts === 1 ? "" : "s"}${d.lastError ? `, ${escape(d.lastError)}` : ""})<details><summary>body</summary><pre style="white-space:pre-wrap">${escape(d.request?.body ?? "")}</pre>${d.request?.headers["Chest-Webhook-Signature"] ? `<small>Chest-Webhook-Signature: <code>${escape(d.request.headers["Chest-Webhook-Signature"])}</code></small>` : ""}</details></li>`).join("");
  const events = hooks.events.slice(-4).reverse().map(e => `<li><code>webhook.disabled</code> ${escape(e.target)} (${escape(e.reason)}) → ${e.status ?? "not posted"}</li>`).join("");
  return `<section><h2>Webhooks (proposal)</h2><p>Up to ${escape(String(proposals.webhooks.max))} addresses. Deliveries are simulated: every target answers 200 unless told otherwise.</p><ul>${targets || "<li class=none>The tool has added no target yet.</li>"}</ul><form method="post" action="/_dev/webhook"><button name="action" value="retry">Play the pending retries</button></form><p>Journal:</p><ul>${deliveries || "<li class=none>No delivery yet.</li>"}</ul>${events ? `<p>Told to the tool:</p><ul>${events}</ul>` : ""}</section>`;
}

// What members chose in the Chest: the zone they work in. (How each gets
// their notifications by email is the Chest's choice, never a tool's.)
function membersPanelOf(chest, proposals, zone) {
  const rows = chest.members.map(m => `<li><form method="post" action="/_dev/member"><input type="hidden" name="member" value="${escape(m.id)}"><b>${escape(m.name)}</b> <input name="timeZone" value="${escape(m.timeZone)}" size="16" aria-label="Zone of ${escape(m.name)}"${m.timeZone === zone ? "" : ' style="border-color:#ffb86b"'}> <button>Set</button></form></li>`).join("");
  void proposals;
  return `<section><h2>Members' choices</h2><p><small>Zone: <code>member.timeZone</code> (the Chest's is ${escape(zone)}). Each member chooses in the Chest how their notifications reach them by email — never the tool.</small></p><ul>${rows}</ul></section>`;
}

// Whether the Chest delivers (Proposal (studio.16)): what mail.available()
// and webhooks.available() answer, and what send does.
function deliveryPanelOf(chest, proposals, mailQuota) {
  const mailNow = mailQuota ? "quota" : chest.delivery.mail;
  const mail = proposals.mail ? `<form method="post" action="/_dev/delivery"><label>Mail <select name="mail">${["ready", "not_connected", "suspended", "quota"].map(v => `<option${v === mailNow ? " selected" : ""}>${v}</option>`).join("")}</select></label><button>Set</button></form>` : "";
  const hooks = proposals.webhooks ? `<form method="post" action="/_dev/delivery"><label>Webhooks <select name="webhooks">${["ready", "suspended"].map(v => `<option${v === chest.delivery.webhooks ? " selected" : ""}>${v}</option>`).join("")}</select></label><button>Set</button></form>` : "";
  return `<section><h2>Delivery (proposal)</h2>${mail}${hooks}<p><small>Now: mail <code>${escape(mailNow)}</code>${proposals.webhooks ? `, webhooks <code>${escape(chest.delivery.webhooks)}</code>` : ""}. <code>not_connected</code>: the company's mail provider is not connected (send throws <code>Unavailable</code>; <code>--no-mail-connector</code> starts so); <code>suspended</code>: unavailable; <code>quota</code>: none left today.</small></p></section>`;
}

export function devPage({ manifest, proposals = {}, chest, schedules: scheduleList = chest.schedules ?? [], runs: runList = chest.runs ?? [], sdkVersion = "", me, origin, publicOrigin = origin, zone = process.env["CHEST_TIME_ZONE"] ?? "UTC", mailQuota = false, schedulesApi, catalogue = [], sampleBrand = null, tool = null }) {
  const name = id => chest.members.find(m => m.id === id)?.name ?? id;
  const people = chest.members.map(m => `<option value="${m.id}"${m.id === me.id ? " selected" : ""}>${escape(m.name)} — ${escape(m.role ?? "no role")}${m.isAdmin ? " (admin)" : ""}</option>`).join("");
  const bell = chest.notifications.slice().reverse().map(n => `<li><b>${escape(name(n.member))}</b> · ${escape(n.title)}${n.body ? `<br><small>${escape(n.body)}</small>` : ""}${n.translations?.fr ? `<br><small lang="fr">fr: ${escape(n.translations.fr.title)}${n.translations.fr.body ? ` — ${escape(n.translations.fr.body)}` : ""}</small>` : ""}<br><a href="${escape(n.path)}">${escape(n.path)}</a>${n.key ? ` <code>${escape(n.key)}</code>` : ""}</li>`).join("") || "<li class=none>Nothing yet.</li>";
  const badges = [...chest.badges].map(([id, count]) => `<li>${escape(name(id))}: <b>${count}</b></li>`).join("") || "<li class=none>None.</li>";
  const files = [...chest.files].map(([n, f]) => `<li><code>${escape(n)}</code> ${escape(f.type)} · ${f.data.byteLength} B</li>`).join("") || "<li class=none>None.</li>";
  const schedules = scheduleList.map(s => {
    let next = null;
    try { next = schedulesApi?.nextRun?.(s.cron, new Date(), zone) ?? null; } catch { next = null; }
    return `<li><form method="post" action="/_dev/schedule"><input type="hidden" name="name" value="${escape(s.name)}"><b>${escape(s.name)}</b> <code>${escape(s.cron)}</code>${schedulesApi?.describeCron ? ` — ${escape(schedulesApi.describeCron(s.cron))}` : ""}${next ? `, next ${escape(next.toISOString().slice(0, 16).replace("T", " "))} UTC` : ""} <button>Run now</button></form></li>`;
  }).join("");
  const runs = runList.slice(-8).reverse().map(r => `<li><code>${escape(r.name)}</code> ${escape(r.scheduledAt.slice(0, 16))} → ${r.status}</li>`).join("");
  const outbox = (chest.outbox ?? []).slice().reverse().slice(0, 12).map(m => `<li><b>${escape(m.subject)}</b>${m.status !== "sent" ? ` <code>${escape(m.status)}</code>` : ""}<br><small>${escape(m.fromName ? m.fromName + " — " : "")}${escape(m.from)} → ${escape(m.to.join(", "))}${m.replyTo ? `<br>replies to <code>${escape(m.replyTo)}</code>` : ""}</small><details><summary>text</summary><pre style="white-space:pre-wrap">${escape(m.text)}</pre></details>${m.status !== "sent" ? "" : `<form method="post" action="/_dev/bounce"><input type="hidden" name="message" value="${escape(m.id)}"><button name="permanent" value="1">Bounce (address unknown)</button> <button name="permanent" value="0">Bounce (mailbox full)</button> <button name="complained" value="1">Marked as spam</button></form>`}</li>`).join("");
  const mailPanel = proposals.mail ? `<section><h2>Mail to people outside (proposal)</h2><p><small>Sent through the company's mail provider (a connector, not built yet). The Chest receives no mail: replies go to the Reply-To address, the company's mailbox.</small></p><p>Outbox:</p><ul>${outbox || "<li class=none>Nothing sent.</li>"}</ul></section>` : "";
  // The calendar bridge (proposal): the signed-in member's feed and what
  // the tool put.
  const calendarEvents = [...(chest.calendar?.values() ?? [])].sort((a, b) => String(a.start ?? a.days?.first).localeCompare(String(b.start ?? b.days?.first))).slice(0, 30).map(e => `<li${e.members.includes(me.id) ? "" : ' style="opacity:.6"'}><b>${escape(e.title[me.language] ?? e.title.en ?? Object.values(e.title)[0])}</b> <code>${escape(e.key)}</code><br><small>${escape(e.days ? `${e.days.first} → ${e.days.last} (whole days)` : `${e.start.slice(0, 16).replace("T", " ")} → ${e.end.slice(0, 16).replace("T", " ")} UTC`)}${e.busy ? "" : " · free"}${e.private ? " · private" : ""} · ${escape(e.members.map(name).join(", "))}</small></li>`).join("");
  const feedUrl = chest.calendar ? chest.feedUrl(me.id) : "";
  const calendarPanel = proposals.calendar === true ? `<section><h2>Calendar (proposal)</h2><p>${escape(me.name)}'s feed (secret; a calendar app on this machine may subscribe): <a href="${escape(feedUrl)}"><code>${escape(feedUrl.replace(origin, ""))}</code></a> · <a href="/_chest/calendar">their page</a></p><form method="post" action="/_dev/feed"><input type="hidden" name="member" value="${escape(me.id)}"><input type="hidden" name="back" value="/_dev"><button>New address</button></form><p>Events the tool put (dimmed: not in ${escape(me.name)}'s feed):</p><ul>${calendarEvents || "<li class=none>None yet.</li>"}</ul></section>` : "";
  // The Chest's groups (proposal): who is in each, and the admin's moves.
  const groupOptions = (chest.groups ?? []).map(g => `<option value="${escape(g.id)}">${escape(g.name)}</option>`).join("");
  const groupList = (chest.groups ?? []).map(g => `<li><b>${escape(g.name)}</b>${g.grants === false ? "" : " <small>(gives the tool)</small>"}: ${escape(g.members.map(name).join(", ") || "nobody")}</li>`).join("");
  const groupsPanel = Array.isArray(proposals.capabilities) && proposals.capabilities.includes("members.groups") ? `<section><h2>The Chest's groups (proposal)</h2><ul>${groupList || "<li class=none>None.</li>"}</ul><form method="post" action="/_dev/group"><select name="member">${chest.members.map(m => `<option value="${m.id}">${escape(m.name)}</option>`).join("")}</select><select name="group">${groupOptions}</select><button name="action" value="add">Add to group</button><button name="action" value="remove">Take out</button></form><p><small>Tells the tool: <code>member.updated</code> (groups)${(proposals.receives ?? []).includes("group.*") ? " and <code>group.changed</code>" : ""}.</small></p></section>` : "";
  const published = (chest.published ?? []).slice(-8).reverse().map(e => `<li><code>${escape(e.type)}</code> <small>${escape(JSON.stringify(e.data).slice(0, 600))}</small><br><small class="event-meta">${e.key ? `key <code>${escape(e.key)}</code> · ` : "no key · "}occurred <time>${escape(e.occurredAt)}</time></small></li>`).join("");
  const receivable = (proposals.receives ?? []).map(r => `<option>${escape(r)}</option>`).join("");
  const eventsPanel = proposals.emits || proposals.receives ? `<section><h2>Events between tools (proposal)</h2>${proposals.emits ? `<p>Published:</p><ul>${published || "<li class=none>None yet.</li>"}</ul>` : ""}${receivable ? `<form method="post" action="/_dev/deliver" style="display:grid;gap:6px"><p style="margin:0">Deliver an event of another tool:</p><select name="type">${receivable}</select><textarea name="data" rows="3">{"member": "${escape(me.id)}"}</textarea><input name="occurredAt" placeholder="occurredAt (now): 2026-09-30T08:00:00Z" aria-label="occurredAt"><input name="source" placeholder="source (the type's first part)" aria-label="source"><button>Deliver</button></form>` : ""}</section>` : "";
  const checks = (chest.checks ?? []).map(c => `<li><form method="post" action="/_dev/check"><input type="hidden" name="name" value="${escape(c.name)}"><b>${escape(c.name)}</b> <code>${escape(c.url)}</code> every ${escape(String(c.every))} min <button name="ok" value="1">Send "up"</button> <button name="ok" value="0">Send "down"</button></form></li>`).join("");
  const checksPanel = proposals.checks ? `<section><h2>Checks (proposal)</h2>${checks ? `<ul>${checks}</ul>` : "<p>The tool has configured no check yet.</p>"}</section>` : "";
  const webhooksPanel = proposals.webhooks ? webhooksPanelOf(chest, proposals) : "";
  const deliveryPanel = proposals.mail || proposals.webhooks ? deliveryPanelOf(chest, proposals, mailQuota) : "";
  const extra = membersPanelOf(chest, proposals, zone) + deliveryPanel + (chest.theme && sampleBrand ? lookPanel(manifest, chest, catalogue, sampleBrand) : "") + checksPanel + webhooksPanel + eventsPanel + calendarPanel + groupsPanel + mailPanel + (schedules ? `<section><h2>Schedules</h2><p><small>From <code>chest.json</code>. “Run now” posts a run, signed (<code>Chest-Schedule</code>), to <code>POST /chest-schedules</code>, as the Chest does on its clock.</small></p><ul>${schedules}</ul>${runs ? `<p>Last runs:</p><ul>${runs}</ul>` : ""}</section>` : "");
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
<header><h1>chest dev · ${escape(manifest.title ?? manifest.name)}</h1><a href="/chest">Open /chest</a>${manifest.public ? `<a href="${escape(publicOrigin)}/">Public part</a>` : ""}<a href="/_dev/logs">Logs</a><span style="margin-left:auto;color:#8fa3b8">${sdkVersion ? `SDK ${escape(sdkVersion)} · ` : ""}team ${escape(origin)} · public ${escape(publicOrigin)}</span></header>
<main>
<section><h2>You are</h2>
<form method="post" action="/_dev/as"><select name="member">${people}</select>
<select name="language"><option value="">their language</option><option value="en">English</option><option value="fr">Français</option></select>
<input type="hidden" name="back" value="/_dev"><button>Switch</button></form>
<p>Signed in as <b>${escape(me.name)}</b>, role <code>${escape(me.role ?? "none")}</code>, language <code>${escape(me.language)}</code>, zone <code>${escape(me.timeZone)}</code>. The Chest: ${escape(process.env["CHEST_ORGANIZATION"] ?? "")}, <code>${escape(zone)}</code>, today <code>${escape(new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date()))}</code>. Roles of the tool: ${(manifest.roles ?? []).map(r => `<code>${escape(r)}</code>`).join(" ")}.</p></section>
${tool ? `<section><h2>The tool</h2><p>Now <code>${escape(tool.state)}</code>${tool.sleepAfter ? `, put to sleep after ${escape(String(tool.sleepAfter))} s without a visit` : " (no sleep: --sleep-after &lt;s&gt; to play it)"}. Static files: ${tool.statics.map(p => `<code>${escape(p)}</code>`).join(" ")}. ${manifest.public ? `Public part on <a href="${escape(publicOrigin)}/">${escape(publicOrigin)}</a>.` : "No public part."}</p><form method="post" action="/_dev/sleep"><button>Put to sleep</button></form><form method="post" action="/_dev/wake"><button>Wake</button></form><p><a href="/_dev/logs">Logs</a> · <code>${escape(tool.logFile)}</code></p></section>` : ""}
<section><h2>Bell (notifications)</h2><form method="post" action="/_dev/clear"><button>Clear</button></form><ul>${bell}</ul></section>
<section><h2>Badges</h2><ul>${badges}</ul></section>
<section><h2>Files</h2><ul>${files}</ul></section>
<section><h2>Members' lifecycle</h2>
<form method="post" action="/_dev/event"><select name="member">${events}</select><select name="type"><option>member.updated</option><option>access.revoked</option><option>member.removed</option><option>member.erased</option></select><button>Send event</button></form>
<p>Removed or erased members leave the fake Chest, with the time they left (<code>leftAt</code>). Former: ${chest.former.map(f => `${escape(f.name ?? "(erased)")}${f.leftAt ? ` <small>left ${escape(f.leftAt.slice(0, 10))}</small>` : ""}`).join(", ") || "none"}. Acknowledged erasures: ${chest.acknowledged.map(a => `<code>${escape(a)}</code>`).join(" ") || "none"}.</p></section>
${extra}
</main></body></html>`;
}

// The tool's log, as its Logs tab shows it: its stdout and stderr, the
// Chest's own lines (started, asleep, woken, refused by the front) beside
// them; newest last. ?stream=err|out|chest keeps one.
export function logsPage({ manifest, entries, logFile, state, stream = "" }) {
  const shown = stream ? entries.filter(e => e.stream === stream) : entries;
  const rows = shown.slice(-1000).map(e => `<tr class="${escape(e.stream)}"><td>${escape(e.at.slice(11, 23))}</td><td>${escape(e.stream)}</td><td>${escape(e.line)}</td></tr>`).join("");
  const tab = (value, label) => `<a href="/_dev/logs${value ? `?stream=${value}` : ""}"${value === stream ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logs · ${escape(manifest.title ?? manifest.name)}</title>
<style>body{font:13px/1.45 ui-monospace,Menlo,monospace;margin:0;background:#101418;color:#e8edf2}header{padding:12px 20px;border-bottom:1px solid #2a3440;display:flex;gap:14px;flex-wrap:wrap;align-items:center}a{color:#7cc4ff}a[aria-current]{color:#e8edf2;font-weight:bold;text-decoration:none}h1{font-size:16px;margin:0}table{border-collapse:collapse;width:100%}td{padding:2px 10px;vertical-align:top;white-space:pre-wrap;word-break:break-word}td:first-child,td:nth-child(2){white-space:nowrap;color:#8fa3b8}tr.err td:last-child{color:#ff9c9c}tr.chest td:last-child{color:#ffb86b}.none{padding:20px;color:#8fa3b8}</style></head><body>
<header><h1>Logs · ${escape(manifest.title ?? manifest.name)}</h1>${tab("", "All")}${tab("out", "stdout")}${tab("err", "stderr")}${tab("chest", "The Chest")}<a href="/_dev/logs.txt">Text</a><a href="/_dev">Back</a><span style="margin-left:auto;color:#8fa3b8">${escape(state)} · ${escape(logFile)}</span></header>
${rows ? `<table>${rows}</table>` : '<p class="none">Nothing logged yet.</p>'}
</body></html>`;
}
