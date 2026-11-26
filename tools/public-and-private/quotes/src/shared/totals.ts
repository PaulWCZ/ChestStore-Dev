// Safe in the browser: no SDK here. The editor computes as the server does,
// with this very code.
//
// The rounding rule, the same everywhere (screen, PDF, exports):
//
// 1. Each line's amount excluding VAT is computed exactly —
//    quantity × unit price × (1 − discount) — then rounded once to the cent,
//    half away from zero (2.345 → 2.35, −2.345 → −2.35).
// 2. The lines' rounded amounts are summed per VAT rate: the taxable base of
//    that rate.
// 3. The VAT of each rate is its base × the rate, rounded once to the cent,
//    half away from zero.
// 4. Total excluding VAT = sum of the bases; VAT = sum of the rates' VAT;
//    total including VAT = the two added. Nothing is rounded twice.
//
// This is the per-line-then-summed method, and it is what the European
// e-invoicing standard (EN 16931, rule BR-CO-17) expects of the VAT
// breakdown, so a structured invoice made later from the same data adds up.
// Integers throughout (BigInt where a product may exceed 2^53).

export type LineAmounts = {
  kind: "line" | "section";
  // Thousandths of a unit (1.5 → 1500), > 0.
  quantity: number;
  // Minor units (cents), excluding VAT; may be negative (a deduction).
  unitPrice: number;
  // Hundredths of a percent, 0 to 10,000.
  discount: number;
  // Hundredths of a percent (2000 = 20 %).
  vatRate: number;
};

export type RateTotal = { rate: number; base: number; vat: number };
export type Totals = { net: number; vat: number; gross: number; rates: RateTotal[] };

// n / d rounded half away from zero, d > 0.
export function roundDiv(n: bigint, d: bigint): bigint {
  const negative = n < 0n;
  const a = negative ? -n : n;
  const q = (a * 2n + d) / (d * 2n);
  return negative ? -q : q;
}

// A line's amount excluding VAT, in minor units.
export function lineNet(line: Pick<LineAmounts, "quantity" | "unitPrice" | "discount">): number {
  const exact = BigInt(line.quantity) * BigInt(line.unitPrice) * BigInt(10_000 - line.discount);
  return Number(roundDiv(exact, 10_000_000n));
}

// The VAT of a base at a rate.
export function vatOf(base: number, rate: number): number {
  return Number(roundDiv(BigInt(base) * BigInt(rate), 10_000n));
}

// A share of an amount (a deposit's percentage), in hundredths of a percent.
export function share(amount: number, percent: number): number {
  return Number(roundDiv(BigInt(amount) * BigInt(percent), 10_000n));
}

// The totals of a document's lines. Without VAT (a company under the VAT
// exemption, or the buyer accounting for it — reverse charge), every line
// goes to one base at 0 %.
export function totals(lines: readonly LineAmounts[], options: { noVat?: boolean } = {}): Totals {
  const bases = new Map<number, number>();
  for (const line of lines) {
    if (line.kind !== "line") continue;
    const rate = options.noVat ? 0 : line.vatRate;
    bases.set(rate, (bases.get(rate) ?? 0) + lineNet(line));
  }
  const rates = [...bases].sort((a, b) => b[0] - a[0]).map(([rate, base]) => ({ rate, base, vat: vatOf(base, rate) }));
  const net = rates.reduce((s, r) => s + r.base, 0);
  const vat = rates.reduce((s, r) => s + r.vat, 0);
  return { net, vat, gross: net + vat, rates };
}

// The bases of a deposit (acompte) of a percentage of a quote, rate by rate:
// each base is its share of the quote's base at that rate, rounded once.
export function depositBases(quote: Totals, percent: number): { rate: number; base: number }[] {
  return quote.rates.map(r => ({ rate: r.rate, base: share(r.base, percent) })).filter(r => r.base !== 0);
}
