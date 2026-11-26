// Safe in the browser: no SDK here.
// fold compares words as people mean them: lower case, no accents, no
// punctuation ("Société  Générale" = "societe generale").
export function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// key: fold without spaces, to match a spreadsheet's headers ("E-mail" =
// "email", "N° TVA" = "ntva").
export function key(value: string): string {
  return fold(value).replace(/\s+/gu, "");
}
