import { Menu } from "@argentic/chest-ui/components";
import { Coins, Download, Gear, Upload } from "../components/icons.tsx";

// The header's "More": the rare places (the bank statement, the
// accountant's export, importing the invoices still to collect, the
// settings), in the kit's ARIA menu button with its label shown. Each item
// is a plain link: the page opens in place.
const icons = { coins: Coins, download: Download, upload: Upload, gear: Gear } as const;
export type MoreItem = { href: string; label: string; icon: keyof typeof icons };

export function MoreMenu({ label, items }: { label: string; items: readonly MoreItem[] }) {
  return <Menu label={label} showLabel items={items.map(item => { const Icon = icons[item.icon]; return { label: item.label, href: item.href, icon: <Icon /> }; })} />;
}
