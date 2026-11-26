import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { Back } from "../components/icons.tsx";
import { localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { company } from "../lib/company.ts";
import { db } from "../lib/db.ts";

// Matching a bank statement to the invoices still to collect: the file
// exported from the bank, its columns checked, each payment received with
// the invoice it pays, recorded in one tap (lib/bank.ts). The statement's
// amounts are read in the tool's default currency (Settings), and only the
// invoices in it are matched.
export async function bankPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { member, t } = ctx;
  const i = t.importer;
  return {
    title: t.bank.title,
    body: (
      <div className="page narrow">
        <a className="back" href="/chest/invoices"><Back />{t.shell.invoices}</a>
        <PageHeader size="m" title={t.bank.title} intro={t.bank.intro} />
        {can(member, "payments")
          ? <Island name="BankView" props={{ t: { bank: t.bank, errors: t.errors, kit: t.kit, importer: { column: i.column, example: i.example, field: i.field, fieldOf: i.fieldOf, ignore: i.ignore, markComma: i.markComma, markPoint: i.markPoint, markNone: i.markNone } }, locale: localeOf(ctx.locale), currency: (await company(db())).currency }} />
          : <p className="notice">{t.errors.forbidden}</p>}
      </div>
    ),
  };
}
