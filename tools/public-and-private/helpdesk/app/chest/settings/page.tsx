import { headers } from "next/headers";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { supportAddress } from "../../../lib/mailer.ts";
import { publicOrigin } from "../../../lib/public-origin.ts";
import { viewer } from "../../../lib/session.ts";
import { savedReplies, settings, tags } from "../../../lib/tickets.ts";
import { SettingsView } from "./settings-view.tsx";

export default async function SettingsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const [s, replies, address, tagList] = await Promise.all([settings(sql), savedReplies(sql, member), supportAddress(), tags(sql, member)]);
  return (
    <div className="boxes">
      <h1>{t.settings.title}</h1>
      <SettingsView
        settings={{ companyName: s.companyName, formOpen: s.formOpen, intro: s.intro, retentionMonths: s.retentionMonths, lateHours: s.lateHours }}
        tags={tagList}
        locale={locale}
        canTags={can(member, "tags.manage")}
        publicAddress={publicOrigin(await headers()) ?? "/"}
        emailAddress={address}
        replies={replies}
        canSettings={can(member, "settings")}
        canReplies={can(member, "replies.manage")}
        canErase={can(member, "customers.erase")}
        canExport={can(member, "export")}
        t={{ settings: t.settings, errors: t.errors }}
      />
    </div>
  );
}
