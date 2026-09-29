import Link from "next/link";
import type { ReactNode } from "react";
import { Lock } from "../../components/icons.tsx";
import type { BoardSummary } from "../../lib/boards.ts";
import { plural, type Catalogue, type Locale } from "../../lib/i18n/index.ts";

// Boards as coloured tiles: name, and what waits on each.
export function BoardTiles({ boards, locale, t, children }: { boards: BoardSummary[]; locale: Locale; t: { open: Catalogue["boards"]["open"]; mine: Catalogue["boards"]["mine"]; late: Catalogue["boards"]["late"]; private: string }; children?: ReactNode }) {
  return (
    <ul className="board-strip">
      {boards.map(b => (
        <li key={b.id}>
          <Link className={`tile c-${b.color}`} href={`/chest/boards/${b.id}`}>
            <h3>{b.name}</h3>
            {b.visibility === "private" && <span className="lock" title={t.private}><Lock /><span className="visually-hidden">{t.private}</span></span>}
            <span className="counts">
              <span>{plural(t.open, b.open, locale)}</span>
              {b.mine > 0 && <span>{plural(t.mine, b.mine, locale)}</span>}
              {b.late > 0 && <span>{plural(t.late, b.late, locale)}</span>}
            </span>
          </Link>
        </li>
      ))}
      {children && <li>{children}</li>}
    </ul>
  );
}
