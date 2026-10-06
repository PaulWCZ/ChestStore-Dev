import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { PageHeader } from "@argentic/chest-ui/components";
import { Back } from "../components/icons.tsx";
import { localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";

// Matching a bank statement to the invoices still to collect: the file
// exported from the bank, its columns checked, each payment received with
// the invoice it pays, recorded in one tap (lib/bank.ts).
export function bankPage(ctx: PageContext<MemberContext>): View {
  const { member, t } = ctx;
  const i = t.importer;
  return {
    title: t.bank.title,
    body: (
      <div className="page narrow">
        <a className="back" href="/chest/invoices"><Back />{t.shell.invoices}</a>
        <PageHeader size="m" title={t.bank.title} intro={t.bank.intro} />
        {can(member, "payments")
          ? <Island name="BankView" props={{ t: { bank: t.bank, errors: t.errors, kit: t.kit, importer: { column: i.column, example: i.example, field: i.field, fieldOf: i.fieldOf, ignore: i.ignore } }, locale: localeOf(ctx.locale), currency: chest.currency }} />
          : <p className="notice">{t.errors.forbidden}</p>}
      </div>
    ),
  };
}
