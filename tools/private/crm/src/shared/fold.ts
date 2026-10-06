// Safe in the browser: no SDK here.
// fold compares words as people mean them: lower case, no accents, no
// punctuation ("Société  Générale" = "societe generale"). The database has
// its own (crm_fold, migrations/0001_crm.sql) for what it searches.
export function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// key: fold without spaces, to match headers ("E-mail" = "email").
export function key(value: string): string {
  return fold(value).replace(/\s+/gu, "");
}
