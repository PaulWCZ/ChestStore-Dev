import type { MemberContext, PageContext, VisitorContext } from "@argentic/chest-app";
import type { Locale } from "../i18n/index.ts";
import type { Sql } from "../lib/db.ts";

// What a page of Forms receives (src/app.tsx makes it): the package's
// context — the member, their words (t), the address — and the database,
// the reader's language as the tool speaks it, the Chest's time zone.
export type Ctx = PageContext<MemberContext> & { sql: Sql; lang: Locale; zone: string };
export type PublicCtx = PageContext<VisitorContext> & { sql: Sql; lang: Locale; zone: string };
