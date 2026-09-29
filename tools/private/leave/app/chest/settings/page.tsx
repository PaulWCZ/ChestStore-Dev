import { notFound } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { holidays } from "../../../lib/calendar.ts";
import { db } from "../../../lib/db.ts";
import { formatDay } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/model.ts";
import { colors } from "../../../lib/model.ts";
import { settings, types } from "../../../lib/rules.ts";
import { viewer } from "../../../lib/session.ts";
import { SettingsView } from "./settings-view.tsx";

// The company's rules and its kinds of leave: HR only.
export default async function SettingsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "settings")) notFound();
  const sql = db();
  const [s, all] = await Promise.all([settings(sql), types(sql, { archived: true })]);
  const year = Number(today().slice(0, 4));
  const list = holidays(year, { alsace: true }).map(h => ({ key: h.key, name: t.holidays[h.key], day: formatDay(h.day, locale, { weekday: "short", day: "numeric", month: "long" }), alsace: h.key === "goodFriday" || h.key === "stStephen" }));
  const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, name: formatDay(`2026-${String(i + 1).padStart(2, "0")}-01`, locale, { month: "long" }) }));
  return (
    <main className="page">
      <h1>{t.settings.title}</h1>
      <SettingsView
        settings={s}
        holidays={list}
        months={months}
        types={all.map(ty => ({
          id: ty.id, key: ty.key, name: ty.name ?? "", builtIn: ty.key ? t.types[ty.key] : "", color: ty.color, balance: ty.balance, perYear: ty.perYear, halfDays: ty.halfDays,
          counting: ty.counting, approval: ty.approval, notes: ty.notes, archived: ty.archived, period: ty.period, periodMonth: ty.periodMonth, unused: ty.unused, overdraw: ty.overdraw, away: ty.away,
        }))}
        colors={colors.map(c => ({ key: c, name: t.colors[c] }))}
        t={{ settings: t.settings, errors: t.errors }}
      />
    </main>
  );
}
