import { Tabs } from "@argentic/chest-ui/components";
import type { Catalogue } from "../i18n/index.ts";

// Settings has two pages for the accountants: their own (vehicle, bank
// details) and the company's. Others only have their own: no switch.
export function SettingsNav({ current, t }: { current: "me" | "company"; t: Catalogue["settings"] }) {
  return (
    <div className="kind-switch">
      <Tabs label={t.sections} current={current} items={[{ id: "me", label: t.mine, href: "/chest/settings" }, { id: "company", label: t.companyTab, href: "/chest/settings/company" }]} />
    </div>
  );
}
