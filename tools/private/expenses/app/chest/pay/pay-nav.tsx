import { Tabs } from "@argentic/chest-ui/components";
import type { Catalogue } from "../../../lib/i18n/index.ts";

// The accountants' money pages: paying people back, and the company cards'
// statements (their receipts). One place in the menu, two tabs.
export function PayNav({ current, t }: { current: "pay" | "cards"; t: Catalogue["cards"] }) {
  return (
    <div className="kind-switch">
      <Tabs label={t.tabs} current={current} items={[{ id: "pay", label: t.tabPay, href: "/chest/pay" }, { id: "cards", label: t.tabCards, href: "/chest/cards" }]} />
    </div>
  );
}
