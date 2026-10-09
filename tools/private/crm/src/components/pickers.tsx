import { call, toast } from "@argentic/chest-app/client";
import { format } from "../i18n/format.ts";
import { Combobox } from "./combobox.tsx";
import type { Choice, Words } from "./shared.ts";

export type PickerWords = Words<"deal">;
// A search as one types: nothing changes, so nothing is refreshed; a
// refusal (the Chest away) is an empty list.
export const searchCompanies = async (q: string) => { const r = await call("pickCompanies", { q }, { refresh: false, quiet: true }); return r.ok ? r.value : []; };
export const searchContacts = async (q: string, company: string | null) => { const r = await call("pickContacts", { q, ...(company ? { company } : {}) }, { refresh: false, quiet: true }); return r.ok ? r.value : []; };

// A company, chosen by typing its name; "+ New company “xyz”" adds it on
// the spot (for whoever may add companies).
export function CompanyPicker({ id, value, onChange, canCreate, t }: { id: string; value: Choice | null; onChange: (company: Choice | null) => void; canCreate: boolean; t: PickerWords }) {
  return (
    <Combobox id={id} value={value} onChange={onChange} placeholder={t.deal.searchCompany} clearLabel={t.deal.noCompany} noMatch={t.deal.noMatch}
      search={searchCompanies}
      {...(canCreate ? {
        create: {
          label: (q: string) => format(t.deal.newCompany, { name: q }),
          run: async (q: string) => {
            // Added on the spot: the page around stays as it is (the dialog open).
            const r = await call("addCompany", { name: q }, { refresh: false });
            if (!r.ok) return null;
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
export function ContactPicker({ id, value, company, onChange, t }: { id: string; value: Choice | null; company: string | null; onChange: (contact: ContactOption | null) => void; t: PickerWords }) {
  return (
    <Combobox<ContactOption> id={id} value={value} onChange={onChange} placeholder={t.deal.searchContact} clearLabel={t.deal.noContact} noMatch={t.deal.noMatch}
      search={q => searchContacts(q, company)} />
  );
}
