import assert from "node:assert/strict";
import { test } from "node:test";
import { between, isPosition, sequence } from "../lib/position.ts";

test("a key between any two keys, in order, however often we insert", () => {
  const keys = sequence(50);
  assert.deepEqual([...keys].sort(), keys);
  assert.ok(keys.every(isPosition));
  // Insert repeatedly at the same place: always strictly between.
  let low = keys[0]!, high = keys[1]!;
  for (let i = 0; i < 200; i++) {
    const mid = between(low, high);
    assert.ok(low < mid && mid < high, `${low} < ${mid} < ${high}`);
    assert.ok(isPosition(mid));
    if (i % 2) low = mid; else high = mid;
  }
  // Before the first, after the last, around edge digits.
  for (const [a, b] of [[null, "1"], [null, "01"], ["z", null], ["zz", null], ["a", "b"], ["a", "a1"], ["az", "b"], [null, null]] as const) {
    const k = between(a, b);
    assert.ok((a === null || a < k) && (b === null || k < b), `${a} < ${k} < ${b}`);
    assert.ok(isPosition(k));
  }
  assert.throws(() => between("b", "a"), RangeError);
});
