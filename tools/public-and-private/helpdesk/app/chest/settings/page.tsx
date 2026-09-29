import * as chest from "@argentic/chest-sdk/chest";
import { headers } from "next/headers";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { formatDate, locales, plural } from "../../../lib/i18n/index.ts";
import { supportAddress } from "../../../lib/mailer.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { publicOrigin } from "../../../lib/public-origin.ts";
import { listRules } from "../../../lib/rules.ts";
import { viewer } from "../../../lib/session.ts";
import { answerers } from "../../../lib/tell.ts";
import { erasures, savedReplies, settings, tags } from "../../../lib/tickets.ts";
import { EmbedBox } from "./embed-box.tsx";
import { HoursBox } from "./hours-box.tsx";
import { RulesBox } from "./rules-box.tsx";
import { SettingsView } from "./settings-view.tsx";

export default async function SettingsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const canSettings = can(member, "settings");
  const [s, replies, address, tagList, rules, team, erased] = await Promise.all([
    settings(sql), savedReplies(sql, member), supportAddress(), tags(sql, member), listRules(sql, member), answerers(),
    can(member, "customers.erase") ? erasures(sql, member) : Promise.resolve([]),
  ]);
  const who = await people([...team, ...rules.map(r => r.assignee).filter((a): a is string => !!a), ...erased.map(e => e.by)]);
  const name = (id: string) => (id === "erased" ? t.people.erased : nameOf(who.get(id), locale));
  const origin = publicOrigin(await headers()) ?? "/";
  return (
    <div className="boxes">
      <h1>{t.settings.title}</h1>
      <SettingsView
        settings={{ companyName: s.companyName, formOpen: s.formOpen, intros: s.intros, retentionMonths: s.retentionMonths, helpUrl: s.helpUrl }}
        tags={tagList}
        locale={locale}
        canTags={can(member, "tags.manage")}
        publicAddress={origin}
        emailAddress={address}
        replies={replies}
        canSettings={canSettings}
        canReplies={can(member, "replies.manage")}
        canErase={can(member, "customers.erase")}
        canExport={can(member, "export")}
        languageLabels={Object.fromEntries(locales.map(code => [code, new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code]))}
        erasures={erased.map(e => plural(t.settings.erasureLine, e.tickets, locale, { name: name(e.by), date: formatDate(e.at, locale, { dateStyle: "medium", timeStyle: "short" }) }))}
        t={{ settings: t.settings, errors: t.errors }}
        after={
          <>
            <HoursBox hours={s.hours} lateHours={s.lateHours} year={Number(chest.today().slice(0, 4))} canSettings={canSettings} locale={locale} t={{ settings: t.settings, errors: t.errors }} />
            <RulesBox rules={rules.map(r => ({ ...r, assigneeName: r.assignee ? name(r.assignee) : null }))} team={team.map(id => ({ id, name: name(id) }))} tags={tagList.map(g => g.name)} canSettings={canSettings} t={{ settings: t.settings, errors: t.errors, priority: t.priority }} />
            <EmbedBox origins={s.frameOrigins} publicAddress={origin} canSettings={canSettings} t={{ settings: t.settings, errors: t.errors, embedTitle: t.public.embedTitle }} />
          </>
        }
      />
    </div>
  );
}
