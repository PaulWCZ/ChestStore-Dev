import { StatusBadge } from "@argentic/chest-ui/components";
import Link from "next/link";
import type { Found } from "../lib/candidates.ts";
import { formatDate, type Catalogue, type Locale } from "../lib/i18n/index.ts";
import { stageLabel } from "../lib/stages.ts";

// Candidates found (a search, the talent pool): name, job, where they
// are, when they applied.
export function FoundList({ list, locale, t, extra }: { list: Found[]; locale: Locale; t: Catalogue; extra?: (f: Found) => React.ReactNode }) {
  return (
    <ul className="found-list">
      {list.map(f => (
        <li key={f.id}>
          <Link href={`/chest/candidates/${f.id}`} className="found-main">
            <span className="found-name">{f.name}</span>
            <span className="muted small">{[f.email, f.jobTitle].filter(Boolean).join(" · ")}</span>
          </Link>
          <StatusBadge tone={f.status === "rejected" ? "danger" : "info"} size="s" label={f.status === "rejected" ? t.export.status.rejected : stageLabel(f.stage, t.jobSettings.defaults)} />
          <span className="muted small found-date">{formatDate(f.createdAt, locale, { day: "numeric", month: "short", year: "numeric" })}</span>
          {extra?.(f)}
        </li>
      ))}
    </ul>
  );
}
