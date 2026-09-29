import Link from "next/link";
import type { Catalogue } from "../../../lib/i18n/index.ts";

// The two parts of the settings (managers): the stages of the pipeline and
// the team's own fields.
export function SettingsTabs({ current, t }: { current: "stages" | "fields"; t: Catalogue }) {
  return (
    <nav className="segmented" aria-label={t.settings.tabs}>
      <Link prefetch={false} href="/chest/settings" aria-current={current === "stages" ? "page" : undefined}>{t.settings.stagesTab}</Link>
      <Link prefetch={false} href="/chest/settings/fields" aria-current={current === "fields" ? "page" : undefined}>{t.settings.fieldsTab}</Link>
    </nav>
  );
}
