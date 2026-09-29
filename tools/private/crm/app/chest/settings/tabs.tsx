"use client";

import { Tabs } from "@argentic/chest-ui/components";
import Link from "next/link";
import type { Catalogue } from "../../../lib/i18n/index.ts";

// The two parts of the settings (managers): the stages of the pipeline and
// the team's own fields — the kit's link tabs (the address keeps the part).
export function SettingsTabs({ current, t }: { current: "stages" | "fields"; t: Catalogue }) {
  return (
    <Tabs label={t.settings.tabs} current={current} link={Link} items={[
      { id: "stages", label: t.settings.stagesTab, href: "/chest/settings" },
      { id: "fields", label: t.settings.fieldsTab, href: "/chest/settings/fields" },
    ]} />
  );
}
