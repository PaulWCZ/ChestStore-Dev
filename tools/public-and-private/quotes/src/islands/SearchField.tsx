import { SearchBox } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";

// A list's search: a plain GET form (it works without script), "/"
// reaches it from anywhere but a field (an island: the shortcut runs in
// the browser). The other filters of the address are kept.
export function SearchField({ action, value, keep, labels, maxLength = 80 }: { action: string; value: string; keep: Readonly<Record<string, string>>; labels: SearchWords; maxLength?: number }) {
  return <SearchBox action={action} value={value} keep={keep} labels={labels} maxLength={maxLength} />;
}
