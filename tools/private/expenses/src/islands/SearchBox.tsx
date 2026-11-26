import { SearchBox as KitSearchBox } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";

// The search box: the kit's, whose "/" key focuses it from anywhere on the
// page (hence an island). Enter opens the search page (a plain form).
export function SearchBox({ labels, value, autoFocus = false, className }: { labels: SearchWords; value?: string; autoFocus?: boolean; className: string }) {
  return <KitSearchBox action="/chest/search" labels={labels} maxLength={100} className={className} {...(value !== undefined ? { value } : {})} autoFocus={autoFocus} />;
}
