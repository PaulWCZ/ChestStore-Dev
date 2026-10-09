import { SearchBox } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";

// "Where is Léa?": the kit's search box (a form to the page's own address;
// "/" reaches it from anywhere in the page).
export function Search({ action, value, keep, labels }: { action: string; value: string; keep: Record<string, string | undefined>; labels: SearchWords }) {
  return <SearchBox action={action} value={value} keep={keep} labels={labels} />;
}
