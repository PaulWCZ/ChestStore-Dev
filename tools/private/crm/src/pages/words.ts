import { pick, type Catalogue } from "../i18n/index.ts";

// The words each island needs, picked from the reader's catalogue: an
// island's props carry their words, and only those (the whole catalogue in
// every island would weigh tens of kilobytes on each page).
const owner = ["people", "peoplePicker", "common", "meta"] as const;
export const words = {
  owner: (t: Catalogue) => pick(t, ...owner),
  step: (t: Catalogue) => pick(t, ...owner, "step", "date"),
  day: (t: Catalogue) => pick(t, ...owner, "step", "date", "home"),
  leads: (t: Catalogue) => pick(t, ...owner, "step", "date", "leads", "timeline", "dialog"),
  deal: (t: Catalogue) => pick(t, ...owner, "deal", "dialog", "date"),
  dealControls: (t: Catalogue) => pick(t, ...owner, "deal", "deals", "dialog", "date"),
  company: (t: Catalogue) => pick(t, ...owner, "company", "dialog", "date", "deal"),
  contact: (t: Catalogue) => pick(t, ...owner, "contact", "dialog", "date", "deal"),
  board: (t: Catalogue) => pick(t, "deals", "deal", "common", "dialog"),
  dealFilters: (t: Catalogue) => pick(t, "deals", "common", "date"),
  listFilters: (t: Catalogue) => pick(t, "common", "contacts", "searchBox", "date"),
  companyList: (t: Catalogue) => pick(t, ...owner, "companies"),
  contactList: (t: Catalogue) => pick(t, ...owner, "contacts"),
  log: (t: Catalogue) => pick(t, "log", "timeline"),
  timeline: (t: Catalogue) => pick(t, "timeline", "people", "booking", "common"),
  files: (t: Catalogue) => pick(t, "common", "files", "errors"),
  maybeSame: (t: Catalogue) => pick(t, "maybeSame", "common", "deal", "dialog"),
  privacy: (t: Catalogue) => pick(t, "contact", "common"),
  settings: (t: Catalogue) => pick(t, "settings", "common"),
  check: (t: Catalogue) => pick(t, "check", "timeline", "common", "deal", "dialog"),
  importer: (t: Catalogue) => pick(t, ...owner, "importer", "errors", "files", "table"),
};
