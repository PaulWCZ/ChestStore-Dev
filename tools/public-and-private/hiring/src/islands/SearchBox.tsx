import { SearchBox as KitSearchBox } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";

// The candidates' search at the right of the header: the kit's box, whose
// "/" key focuses it from anywhere on the page (hence an island). Enter
// opens the search page.
export function SearchBox({ labels }: { labels: SearchWords }) {
  return <KitSearchBox action="/chest/search" labels={labels} id="top-q" />;
}
