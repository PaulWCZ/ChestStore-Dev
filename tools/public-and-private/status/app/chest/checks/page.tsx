import * as chest from "@argentic/chest-sdk/chest";
import { PageHeader } from "@argentic/chest-ui/components";
import { checkError } from "../../../lib/check-words.ts";
import { checkLimits, everyChoices, listWatches, statuses } from "../../../lib/checks.ts";
import { allComponents } from "../../../lib/components.ts";
import { db } from "../../../lib/db.ts";
import { format, plural, stamp } from "../../../lib/i18n/index.ts";
import { viewer } from "../../../lib/session.ts";
import { checksState } from "../../../lib/settings.ts";
import { heartbeatEvery, listHeartbeats } from "../../../lib/heartbeats.ts";
import { ChecksForm, type CheckRow } from "./checks-form.tsx";
import { HeartbeatsView } from "./heartbeats-view.tsx";

// Automatic checks: for each service, an address the Chest opens from the
// outside, how often, what answer is expected — and how each one stands.
export default async function ChecksPage() {
  const v = await viewer();
  if (!v) return null;
  const { locale, t } = v;
  const sql = db();
  const zone = chest.timeZone();
  const now = new Date();
  const [components, watches, states, state, beats] = await Promise.all([allComponents(sql), listWatches(sql), statuses(sql), checksState(sql), listHeartbeats(sql)]);
  const everyLabel = (m: number) => (t.heartbeats as Record<string, string>)[`e${m}`] ?? String(m);
  const groups = new Map(components.filter(c => c.kind === "group").map(g => [g.id, g.name]));
  const order = new Map(components.filter(c => c.parentId === null).map(c => [c.id, c.position]));
  const rows: CheckRow[] = components
    .filter(c => c.kind === "component")
    .sort((a, b) => (order.get(a.parentId ?? a.id) ?? 0) - (order.get(b.parentId ?? b.id) ?? 0) || (a.parentId === null ? -1 : a.position) - (b.parentId === null ? -1 : b.position))
    .map(c => {
      const w = watches.find(x => x.componentId === c.id);
      const s = states.get(c.id);
      const last = s?.last;
      const standing = !w ? t.checks.notWatched
        : s?.downSince ? `${format(t.checks.down, { time: stamp(s.downSince, zone, locale, now) })} — ${checkError(t.checks, last?.error ?? null, last?.status ?? null, last?.ms ?? 0)}`
        : !last ? t.checks.noResult
        : last.ok ? format(t.checks.up, { ms: last.ms, time: stamp(last.at, zone, locale, now) })
        : `${plural(t.checks.failing, s!.failures, locale)} — ${checkError(t.checks, last.error, last.status, last.ms)}`;
      return {
        componentId: c.id,
        name: c.name,
        group: c.parentId ? groups.get(c.parentId) ?? null : null,
        url: w?.url ?? "",
        every: w?.every ?? 5,
        expectStatus: w?.expectStatus ?? 200,
        maxMs: w?.maxMs ?? 3000,
        standing,
        tone: !w ? "none" : s?.downSince ? "major" : last && !last.ok ? "degraded" : last ? "operational" : "none",
      };
    });
  const watched = watches.length;
  return (
    <div className="narrow stack-l">
      <PageHeader size="m" title={t.checks.title} intro={t.checks.intro} />
      {state === "unavailable" ? <p className="note warn" role="status">{t.checks.unavailable}</p> : state === "running" && <p className="note">{plural(t.checks.running, watched, locale)}</p>}
      <ChecksForm
        rows={rows}
        everyChoices={[...everyChoices].map(n => ({ value: n, label: plural(t.checks.everyValue, n, locale) }))}
        limit={format(t.checks.limit, { max: checkLimits.watches })}
        locale={locale}
        t={{ checks: { address: t.checks.address, addressLabel: t.checks.addressLabel, addressPlaceholder: t.checks.addressPlaceholder, every: t.checks.every, status: t.checks.status, maxMs: t.checks.maxMs, save: t.checks.save, saved: t.checks.saved, savedOff: t.checks.savedOff, group: t.checks.group, status200: t.checks.status200, status204: t.checks.status204, status301: t.checks.status301, status302: t.checks.status302, status401: t.checks.status401, statusOther: t.checks.statusOther }, seconds: t.checks.seconds, errors: t.errors }}
      />
      <HeartbeatsView
        rows={beats.map(b => ({
          componentId: b.componentId,
          name: components.find(c => c.id === b.componentId)?.name ?? "",
          every: b.every,
          everyLabel: everyLabel(b.every),
          silent: b.downSince !== null,
          standing: b.downSince ? format(t.heartbeats.silentSince, { time: stamp(b.downSince, zone, locale, now) }) : b.lastSeen ? format(t.heartbeats.seen, { time: stamp(b.lastSeen, zone, locale, now) }) : t.heartbeats.never,
        }))}
        services={components.filter(c => c.kind === "component").map(c => ({ id: c.id, name: c.name }))}
        every={heartbeatEvery.map(m => ({ value: m, label: everyLabel(m) }))}
        t={{ heartbeats: t.heartbeats, errors: t.errors }}
      />
    </div>
  );
}
