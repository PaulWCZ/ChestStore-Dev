import { SearchBox as KitSearchBox } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";

// The search at the right of the steel bar: the kit's box, whose "/" key
// focuses it from anywhere on the page (hence an island). Enter opens the
// list, found by tag, serial number, model, place or holder — a tag typed
// exactly (what a barcode scanner types) opens its item.
export function SearchBox({ labels, maxLength }: { labels: SearchWords; maxLength: number }) {
  return <KitSearchBox action="/chest/items" labels={labels} maxLength={maxLength} />;
}
