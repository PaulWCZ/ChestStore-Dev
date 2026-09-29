// Safe in the browser: no SDK here.
// Matching company card payments to the expenses people added: pure, tested
// alone (test/cards.test.ts). A payment and an expense go together when
// they are the same person's, the amounts agree (exactly, or within a
// tolerance: a tip, a card's exchange rate), the dates are close (a
// statement often carries the day the bank settled, a few days after the
// receipt), and — to decide between close candidates — the statement's
// label shares a word with the expense's shop. Each expense matches one
// payment at most, the best pairs first.

export type CardPayment = { key: string; member: string; date: string; label: string; amount: number; currency: string };
export type Candidate = { id: string; member: string; date: string; merchant: string; amount: number; currency: string; base: number | null; baseCurrency: string | null };

// The window: the expense from 5 days before the statement's date to 1 day
// after it.
export const dateWindow = { before: 5, after: 1 } as const;
// The tolerance on the amount: 2 % or 0.50 in the same currency; 4 % or
// 1.00 against an expense in another currency, through its amount in the
// statement's (the card's rate and fees differ from the one typed).
export const tolerance = { same: { percent: 2, minor: 50 }, converted: { percent: 4, minor: 100 } } as const;
// A pair counts from this score (amount + date + words, below).
export const threshold = 5;

// Words that say nothing of the shop: the bank's own, card numbers,
// dates, cities' postcodes. What is left identifies the merchant.
const noise = new Set([
  "cb", "carte", "cartes", "card", "paiement", "paiements", "payment", "achat", "achats", "purchase", "facture", "factures", "prlv", "prelevement", "sepa", "vir", "virement",
  "retrait", "dab", "pos", "tpe", "contactless", "sans", "contact", "fr", "fra", "france", "eur", "euro", "euros", "the", "les", "des", "and", "sas", "sarl", "sa", "ltd", "inc", "www", "com",
  "debit", "credit", "operation", "ope", "le", "la", "du", "de", "et", "par", "chez", "with", "via",
]);

export function labelWords(text: string): string[] {
  return [...new Set(
    text.normalize("NFKD").replace(/[̀-ͯ]/gu, "").toLowerCase()
      .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/gu, " ")
      .replace(/[^a-z0-9]+/gu, " ")
      .split(" ")
      .filter(w => w.length >= 3 && !/^\d+$/u.test(w) && !/^x+\d+$/u.test(w) && !noise.has(w)),
  )];
}

// The shop's name as a draft gets it from the statement's label: the
// bank's words, card numbers and dates taken off, in the label's own case
// ("CB CARREFOUR CITY 24/09 CARTE X1234" → "CARREFOUR CITY").
export function merchantFromLabel(label: string): string {
  const kept = label
    .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/gu, " ")
    .split(/\s+/u)
    .filter(w => {
      const plain = w.normalize("NFKD").replace(/[̀-ͯ]/gu, "").toLowerCase().replace(/[^a-z0-9*]/gu, "");
      return plain !== "" && !noise.has(plain) && !/^[0-9x*]*\d{3,}[0-9x*]*$/u.test(plain) && !/^\d{1,2}$/u.test(plain);
    })
    .join(" ")
    .trim();
  return (kept || label.trim()).slice(0, 120);
}

const dayNumber = (iso: string) => Math.round(Date.parse(iso + "T00:00:00Z") / 86400000);

// score says how well an expense fits a payment, or null when it cannot be
// the same thing.
export function score(p: CardPayment, c: Candidate): { score: number; days: number; diff: number } | null {
  if (p.member !== c.member) return null;
  const days = dayNumber(c.date) - dayNumber(p.date);
  if (days < -dateWindow.before || days > dateWindow.after) return null;
  let points: number;
  let diff: number;
  if (c.currency === p.currency) {
    diff = Math.abs(c.amount - p.amount);
    const allowed = Math.max(tolerance.same.minor, Math.round((p.amount * tolerance.same.percent) / 100));
    if (diff > allowed) return null;
    points = diff === 0 ? 4 : 1;
  } else if (c.base !== null && c.baseCurrency === p.currency) {
    diff = Math.abs(c.base - p.amount);
    const allowed = Math.max(tolerance.converted.minor, Math.round((p.amount * tolerance.converted.percent) / 100));
    if (diff > allowed) return null;
    points = diff * 100 <= p.amount ? 3 : 1;
  } else return null;
  points += days === 0 ? 3 : Math.abs(days) === 1 ? 2 : 1;
  const words = labelWords(p.label);
  const shop = new Set(labelWords(c.merchant));
  if (words.some(w => shop.has(w))) points += 3;
  return points >= threshold ? { score: points, days, diff } : null;
}

// match pairs payments and expenses: every possible pair scored, the best
// first (then the closest date, the smallest difference), each side used
// once. Answers payment key → expense id.
export function match(payments: CardPayment[], candidates: Candidate[]): Map<string, string> {
  const pairs: { key: string; id: string; score: number; days: number; diff: number }[] = [];
  for (const p of payments) {
    for (const c of candidates) {
      const s = score(p, c);
      if (s) pairs.push({ key: p.key, id: c.id, ...s });
    }
  }
  pairs.sort((a, b) => b.score - a.score || Math.abs(a.days) - Math.abs(b.days) || a.diff - b.diff || a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const pair of pairs) {
    if (out.has(pair.key) || used.has(pair.id)) continue;
    out.set(pair.key, pair.id);
    used.add(pair.id);
  }
  return out;
}
