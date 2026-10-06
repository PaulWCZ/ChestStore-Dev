import { chest } from "@argentic/chest-sdk/chest";
import { Island, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import type { TeamContext } from "../app.tsx";
import { Box } from "../components/box.tsx";
import { Download } from "../components/icons.tsx";
import { formatDate, languageIn, languageNames, locales, plural } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { supportAddress } from "../lib/mailer.ts";
import { targets as noticeTargets } from "../lib/notices.ts";
import { nameOf, people } from "../lib/people.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { listRules } from "../lib/rules.ts";
import { answerers } from "../lib/tell.ts";
import { erasures, savedReplies, settings, tags } from "../lib/tickets.ts";

// Settings, /chest/settings: the public form, working hours and the
// "waiting too long" threshold, rules on arrival, Slack and Teams, the
// websites that may show the form, tags, saved replies, export, erasing a
// customer's data. Each box saves itself (an island each); those who may
// not change a box read it.
export async function settingsPage({ sql, member, lang: locale, t, f }: TeamContext): Promise<View> {
  const canSettings = can(member, "settings");
  const [s, replies, address, tagList, rules, team, erased] = await Promise.all([
    settings(sql), savedReplies(sql, member), supportAddress(), tags(sql, member), listRules(sql, member), answerers(),
    can(member, "customers.erase") ? erasures(sql, member) : Promise.resolve([]),
  ]);
  // Slack and Teams: the administrators' (the addresses are theirs to see).
  const notices = canSettings ? await noticeTargets(sql, member) : null;
  const who = await people([...team, ...rules.map(r => r.assignee).filter((a): a is string => !!a), ...erased.map(e => e.by)]);
  const name = (id: string) => (id === "erased" ? t.people.erased : nameOf(who.get(id), locale));
  const origin = publicOrigin() ?? "/";
  const today = chest.today();
  const st = t.settings;
  return {
    title: st.title,
    body: (
      <div className="boxes">
        <PageHeader size="m" title={st.title} />
        <Island name="FormBox" props={{
          settings: { companyName: s.companyName, formOpen: s.formOpen, intros: s.intros, retentionMonths: s.retentionMonths, helpUrl: s.helpUrl },
          publicAddress: origin, emailAddress: address, canSettings,
          languages: locales.map(code => ({ code, label: languageIn(code, locale) })),
          t: st,
        }} />
        <Island name="HoursBox" props={{ hours: s.hours, lateHours: s.lateHours, year: Number(today.slice(0, 4)), today, canSettings, locale, t: { settings: st, dates: t.kit.date } }} />
        <Island name="RulesBox" props={{ rules: rules.map(r => ({ ...r, assigneeName: r.assignee ? name(r.assignee) : null })), team: team.map(id => ({ id, name: name(id) })), tags: tagList.map(g => g.name), canSettings, t: { settings: st, priority: t.priority, peoplePicker: t.kit.peoplePicker } }} />
        {notices && <Island name="NoticesBox" props={{ delivery: notices.delivery, targets: notices.targets.map(x => ({ id: x.id, kind: x.kind, label: x.label, shown: x.shown, events: x.events, disabled: x.disabled, lastError: x.lastError, status: x.status })), canSettings, t: { settings: st, dialog: t.kit.dialog } }} />}
        <Island name="EmbedBox" props={{ origins: s.frameOrigins, publicAddress: origin, canSettings, languages: locales.map(code => ({ code, name: languageNames[code] ?? code })), t: { settings: st, embedTitle: t.public.embedTitle } }} />
        <Island name="TagsBox" props={{ tags: tagList.map(g => ({ id: g.id, name: g.name, count: plural(st.tagCount, g.tickets, locale) })), canTags: can(member, "tags.manage"), t: st }} />
        <Island name="RepliesBox" props={{ replies, canReplies: can(member, "replies.manage"), t: st }} />
        {can(member, "export") && (
          <Box title={st.export} icon={<Download />}>
            <p className="hint">{st.exportHint}</p>
            <div><a className="button quiet" href="/chest/export"><Download />{st.exportZip}</a></div>
          </Box>
        )}
        {can(member, "customers.erase") && (
          <Island name="EraseBox" props={{
            erasures: erased.map(e => plural(st.erasureLine, e.tickets, locale, { name: name(e.by), date: formatDate(e.at, locale, f.timeZone, { dateStyle: "medium", timeStyle: "short" }) })),
            locale,
            t: st,
          }} />
        )}
      </div>
    ),
  };
}
