import * as chest from "@argentic/chest-sdk/chest";
import { PageHeader } from "@argentic/chest-ui/components";
import { Back } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { viewer } from "../../../lib/session.ts";
import { BankView } from "./bank-view.tsx";

// Matching a bank statement to the invoices still to collect: the file
// exported from the bank, its columns checked, each payment received with
// the invoice it pays, recorded in one tap (lib/bank.ts).
export default async function BankPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  return (
    <div className="page narrow">
      <a className="back" href="/chest/invoices"><Back />{t.shell.invoices}</a>
      <PageHeader size="m" title={t.bank.title} intro={t.bank.intro} />
      {can(member, "payments") ? <BankView t={t} locale={locale} currency={chest.currency()} /> : <p className="notice">{t.errors.forbidden}</p>}
    </div>
  );
}
