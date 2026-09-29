import type { DateWords } from "@argentic/chest-ui/components/logic";
import type { Catalogue } from "./index.ts";

// The kit's DateWords from this tool's catalogue: the words are the
// catalogue's (one file per language); the order of a numeric date and
// the first day of the week are the same in every language the tool
// speaks (day/month/year, Monday — lab/GLOSSARY.md "Dates and times").
export function dateWords(t: Pick<Catalogue, "date">): DateWords {
  return { order: "dmy", weekStart: 1, ...t.date };
}
