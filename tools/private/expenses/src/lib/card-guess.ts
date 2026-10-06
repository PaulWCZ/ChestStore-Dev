// What a company card payment was for, guessed from its bank label with the
// accountant's word list (card_rules, migrations/0004_card_words.sql):
// pure, browser-safe, tested (test/card-guess.test.ts).
//
// A label and a rule are both read as words: accents and case aside, any
// other character a space ("UBER *TRIP-PARIS" → "UBER TRIP PARIS"). A rule
// matches when all its words appear in a row as whole words ("BOULANGER"
// is not in "BOULANGERIE"). Of the rules that match, the longest wins
// ("UBER EATS" over "UBER"); between two of the same length, the first
// given.

export type CardRule = { words: string; categoryId: string };

// ruleWords is how a rule is kept: its words, upper case, without accents,
// one space between them ("" when nothing is left).
export function ruleWords(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/gu, "").toUpperCase().replace(/[^A-Z0-9]+/gu, " ").trim();
}

export function guessCategory(label: string, rules: readonly CardRule[]): string | null {
  const words = ` ${ruleWords(label)} `;
  let best: CardRule | null = null;
  for (const rule of rules) {
    const wanted = ruleWords(rule.words);
    if (wanted === "" || !words.includes(` ${wanted} `)) continue;
    if (!best || wanted.length > ruleWords(best.words).length) best = rule;
  }
  return best?.categoryId ?? null;
}
