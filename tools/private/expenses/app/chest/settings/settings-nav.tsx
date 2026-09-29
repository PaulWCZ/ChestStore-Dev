import type { Catalogue } from "../../../lib/i18n/index.ts";

// Settings has two pages for the accountants: their own (vehicle, bank
// details) and the company's. Others only have their own: no switch.
export function SettingsNav({ current, t }: { current: "me" | "company"; t: Catalogue["settings"] }) {
  return (
    <nav className="kind-switch" aria-label={t.sections}>
      <a href="/chest/settings" aria-current={current === "me" ? "page" : undefined}>{t.mine}</a>
      <a href="/chest/settings/company" aria-current={current === "company" ? "page" : undefined}>{t.companyTab}</a>
    </nav>
  );
}
