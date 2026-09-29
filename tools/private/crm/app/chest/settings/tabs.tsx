"use client";

import { Tabs } from "@argentic/chest-ui/components";
import Link from "next/link";
import type { Catalogue } from "../../../lib/i18n/index.ts";

// The parts of the settings (managers): the stages of the pipeline, the
// team's own fields and the form answers to check — the kit's link tabs (the address keeps the part).
export function SettingsTabs({ current, t }: { current: "stages" | "fields" | "forms"; t: Catalogue }) {
  return (
    <Tabs label={t.settings.tabs} current={current} link={Link} items={[
      { id: "stages", label: t.settings.stagesTab, href: "/chest/settings" },
      { id: "fields", label: t.settings.fieldsTab, href: "/chest/settings/fields" },
      { id: "forms", label: t.check.tab, href: "/chest/settings/forms" },
    ]} />
  );
}
