import { SearchBox } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";

// The kit's search box — a plain GET form, the words in the address —,
// an island for its "/" key, which focuses it from anywhere on the page.
export function Search({ action, value, keep, label, labels }: { action: string; value: string; keep: Record<string, string>; label: string; labels: SearchWords }) {
  return <SearchBox action={action} value={value} keep={keep} maxLength={100} labels={{ ...labels, label, placeholder: label }} />;
}
