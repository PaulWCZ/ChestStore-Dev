// Safe in the browser: no SDK here.
// What a person picker offers before anything is typed: everyone, when
// they fit on one short list (a small company picks with one tap);
// nobody otherwise (typing two letters finds anyone).
export function offered<T>(list: readonly T[], max = 8): T[] {
  return list.length <= max ? [...list] : [];
}
