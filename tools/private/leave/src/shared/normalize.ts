// Safe in the browser: no SDK here.
// A text as the imports compare it: no accents, no case, words only
// ("Congés payés N-1" → "conges payes n 1").
export const normalize = (text: string): string =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
