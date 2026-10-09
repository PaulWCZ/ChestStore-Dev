import { AppError, Island, redirect, type PageContext, type View } from "@argentic/chest-app";
import { Tabs } from "@argentic/chest-ui/components";
import { composeData, guestNames, initialOf } from "../lib/compose.ts";
import { composeWords } from "../lib/compose-words.ts";
import { db } from "../lib/db.ts";
import { expense } from "../lib/expenses.ts";
import { format, localeOf } from "../i18n/index.ts";

// Add an expense: a receipt (the photo first, then the amount), a trip
// with one's own vehicle (?trip=1), or a flat rate (?allowance=1).
export async function newPage({ member, t, locale: language, query }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const kind = query("trip") === "1" ? "trip" : query("allowance") === "1" ? "allowance" : "receipt";
  const data = await composeData(db(), member, t, locale);
  const title = kind === "trip" ? t.form.newTrip : kind === "allowance" ? t.form.newAllowance : t.form.newTitle;
  return {
    title,
    body: (
      <div className="page">
        <div className="compose-top page-head">
          <h1>{title}</h1>
          <div className="kind-switch">
            <Tabs label={t.form.kind} current={kind} items={[
              { id: "receipt", label: t.form.kindReceipt, href: "/chest/new" },
              { id: "trip", label: t.form.kindTrip, href: "/chest/new?trip=1" },
              ...(data.allowances.length > 0 ? [{ id: "allowance", label: t.form.kindAllowance, href: "/chest/new?allowance=1" }] : []),
            ]} />
          </div>
        </div>
        <Island id={`compose-new-${kind}`} name="Compose" props={{ kind, data, initial: null, locale, t: composeWords(t) }} />
      </div>
    ),
  };
}

// Edit a draft (a refused one shows why, above the fields). Not one's own
// draft any more (sent, or someone else's): its page.
export async function editPage({ member, t, locale: language, param }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const id = param("id");
  const sql = db();
  const found = await expense(sql, member, id).catch((error: unknown) => {
    if (error instanceof AppError) return null;
    throw error;
  });
  if (!found || found.expense.deleted) throw new AppError("not_found");
  if (!found.access.own || found.expense.status !== "draft") redirect(`/chest/expenses/${found.expense.id}`);
  const e = found.expense;
  const data = await composeData(sql, member, t, locale, { category: e.categoryId, ...(e.allowance ? { allowance: e.allowance.id } : {}) });
  const initial = initialOf(e, locale, await guestNames(e, locale));
  const kind = e.trip ? "trip" : e.allowance ? "allowance" : "receipt";
  const title = e.trip ? t.form.editTrip : e.allowance ? t.form.editAllowance : t.form.editTitle;
  return {
    title,
    body: (
      <div className="page">
        <div className="page-head">
          <h1>{title}</h1>
        </div>
        {e.refusedReason && <p className="notice bad refused-note">{format(t.home.refusedBecause, { reason: e.refusedReason })}</p>}
        <Island id={`compose-${e.id}`} name="Compose" props={{ kind, data, initial, locale, t: composeWords(t) }} />
      </div>
    ),
  };
}
