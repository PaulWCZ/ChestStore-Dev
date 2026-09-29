"use client";

import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { addCompany, pickCompanies, pickContacts } from "../actions.ts";
import { Combobox } from "./combobox.tsx";
import type { Choice } from "./shared.ts";

// A company, chosen by typing its name; "+ New company “xyz”" adds it on
// the spot (for whoever may add companies).
export function CompanyPicker({ id, value, onChange, canCreate, t }: { id: string; value: Choice | null; onChange: (company: Choice | null) => void; canCreate: boolean; t: Catalogue }) {
  const toast = useToast();
  return (
    <Combobox id={id} value={value} onChange={onChange} placeholder={t.deal.searchCompany} clearLabel={t.deal.noCompany} noMatch={t.deal.noMatch}
      search={async q => { const r = await pickCompanies(q); return r.ok ? r.value : []; }}
      {...(canCreate ? {
        create: {
          label: (q: string) => format(t.deal.newCompany, { name: q }),
          run: async (q: string) => {
            const r = await addCompany({ name: q });
            if (!r.ok) {
              toast(format(t.errors[r.error], r.values));
              return null;
            }
            toast(format(t.deal.companyCreated, { name: r.value.name }));
            return { id: r.value.id, name: r.value.name };
          },
        },
      } : {})} />
  );
}

export type ContactOption = Choice & { detail?: string; companyId: string | null; companyName: string | null };

// A person, chosen by typing their name or email: those of the chosen
// company first (and people of no company), everyone when none is chosen.
export function ContactPicker({ id, value, company, onChange, t }: { id: string; value: Choice | null; company: string | null; onChange: (contact: ContactOption | null) => void; t: Catalogue }) {
  return (
    <Combobox<ContactOption> id={id} value={value} onChange={onChange} placeholder={t.deal.searchContact} clearLabel={t.deal.noContact} noMatch={t.deal.noMatch}
      search={async q => { const r = await pickContacts(q, company); return r.ok ? r.value : []; }} />
  );
}
