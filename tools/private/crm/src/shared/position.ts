// Fractional positions: a key between two others, so that moving a card
// writes one row. Keys are strings over 0-9a-z compared bytewise (the
// columns are collate "C"); a key never ends with "0", so there is always
// room below it.
const digits = "0123456789abcdefghijklmnopqrstuvwxyz";
const pattern = /^[0-9a-z]*[1-9a-z]$/u;

export function isPosition(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && pattern.test(value);
}

// between gives a key strictly after `before` and strictly before `after`
// (null: no bound on that side).
export function between(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) throw new RangeError("positions out of order");
  let lower = before;
  let upper = after;
  let prefix = "";
  for (let i = 0; ; i++) {
    const low = lower !== null && i < lower.length ? digits.indexOf(lower[i]!) : 0;
    const high = upper !== null ? (i < upper.length ? digits.indexOf(upper[i]!) : 0) : digits.length;
    if (low === high) {
      prefix += digits[low];
      continue;
    }
    const middle = Math.floor((low + high) / 2);
    if (middle > low) return prefix + digits[middle];
    // Adjacent digits: keep the lower one; anything after it is below the
    // upper bound, so only the lower bound still counts.
    prefix += digits[low];
    upper = null;
  }
}

// sequence gives n keys in order, short and evenly spread (a stage's keys
// written again): all of one width — enough base-36 digits for n with
// room around each — a key ending in "0" closed with "i" (a key never ends
// with "0", and the order stays).
export function sequence(n: number): string[] {
  let width = 1;
  while (36 ** width < (n + 1) * 36) width++;
  const step = Math.floor(36 ** width / (n + 1));
  return Array.from({ length: n }, (_, i) => {
    const key = ((i + 1) * step).toString(36).padStart(width, "0");
    return key.endsWith("0") ? key + "i" : key;
  });
}
