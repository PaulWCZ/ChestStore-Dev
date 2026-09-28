// Safe on both sides (no "use client"): the values of the forms, and
// what a new record starts with.
export type CompanyValues = { id?: string; name: string; website: string; phone: string; address: string; industry: string; notes: string; tags: string; owner: string | null };
export const emptyCompany = (me: string): CompanyValues => ({ name: "", website: "", phone: "", address: "", industry: "", notes: "", tags: "", owner: me });

export type ContactValues = { id?: string; name: string; email: string; phone: string; title: string; company: string | null; notes: string; tags: string; owner: string | null };
export const emptyContact = (me: string, company: string | null = null): ContactValues => ({ name: "", email: "", phone: "", title: "", company, notes: "", tags: "", owner: me });

export type DealValues = { id?: string; title: string; company: string | null; contact: string | null; value: string; stage: string; expectedClose: string; owner: string | null };
