// Safe on both sides (no "use client"): the values of the forms, and
// what a new record starts with. The team's own fields are strings in a
// form (`custom`, by field id), checked by the server.
import type { Custom } from "../shared/custom.ts";
import type { Choice } from "./shared.ts";

export type CustomForm = Record<string, string>;
export const customForm = (custom: Custom): CustomForm => Object.fromEntries(Object.entries(custom).map(([k, v]) => [k, String(v)]));

export type CompanyValues = { id?: string; name: string; website: string; phone: string; email: string; address: string; postcode: string; city: string; country: string; siren: string; vat: string; industry: string; notes: string; tags: string; owner: string | null; custom: CustomForm };
export const emptyCompany = (me: string, name = ""): CompanyValues => ({ name, website: "", phone: "", email: "", address: "", postcode: "", city: "", country: "", siren: "", vat: "", industry: "", notes: "", tags: "", owner: me, custom: {} });

export type ContactValues = { id?: string; name: string; email: string; phone: string; phone2: string; url: string; title: string; company: Choice | null; notes: string; tags: string; owner: string | null; custom: CustomForm };
export const emptyContact = (me: string, company: Choice | null = null): ContactValues => ({ name: "", email: "", phone: "", phone2: "", url: "", title: "", company, notes: "", tags: "", owner: me, custom: {} });

export type DealValues = { id?: string; title: string; company: Choice | null; contact: Choice | null; value: string; stage: string; expectedClose: string; owner: string | null; custom: CustomForm };
export const emptyDeal = (me: string, stage: string, company: Choice | null = null, contact: Choice | null = null): DealValues => ({ title: "", company, contact, value: "", stage, expectedClose: "", owner: me, custom: {} });
