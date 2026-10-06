import { SearchBox } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";
import { useEffect } from "react";

// The search box (the kit's: a form to /chest/search that works without
// script; "/" focuses it once the page runs). In the header of every page
// but the search page, which has its own, with what was searched.
export function Search({ id, value, maxLength, autoFocus = false, labels }: { id: string; value?: string; maxLength?: number; autoFocus?: boolean; labels: SearchWords }) {
  return <SearchBox id={id} action="/chest/search" labels={labels} {...(value !== undefined ? { value } : {})} {...(maxLength !== undefined ? { maxLength } : {})} autoFocus={autoFocus} />;
}

// The page runs in the browser: its buttons answer (the browser flows wait
// for this marker on <html> rather than for a time). Every layout has it.
export function Ready() {
  useEffect(() => {
    document.documentElement.dataset["hydrated"] = "";
  }, []);
  return null;
}
