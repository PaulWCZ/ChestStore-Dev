import assert from "node:assert/strict";
import { test } from "node:test";
import jsQR from "jsqr";
import { encode, svgPath } from "../src/shared/qr.ts";

// The encoder is checked by reading its codes back with a decoder (jsQR,
// Apache-2.0, a dev dependency only): short and long texts, versions with
// version information (7+) and 16-bit lengths (10+), UTF-8.
function decode(matrix: boolean[][]): string | null {
  const scale = 4, border = 4;
  const size = (matrix.length + border * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((row, y) => row.forEach((dark, x) => {
    if (!dark) return;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + border) * scale + dy) * size + (x + border) * scale + dx) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }));
  return jsQR(data, size, size)?.data ?? null;
}

test("codes read back, from a tag to a long link", () => {
  const texts = [
    "EQ-0042",
    "https://equipment-chest.atelier-martin.fr/chest/items/42",
    "https://equipment-chest.a-rather-long-company-name.example.com/chest/items/123456789012?from=label",
    "x".repeat(150),
    "y".repeat(300),
    "Équipe « matériel » — 12 €",
    "z".repeat(1200),
  ];
  for (const text of texts) {
    const matrix = encode(text);
    assert.equal(matrix.length % 4, 1, "size is 4v+17");
    assert.equal(decode(matrix), text, `decoded ${text.slice(0, 30)} (${matrix.length} modules)`);
  }
});

test("the smallest version that fits is used", () => {
  assert.equal(encode("EQ-0042").length, 21);
  assert.equal(encode("https://equipment-chest.atelier-martin.fr/chest/items/42").length, 33);
  assert.throws(() => encode("q".repeat(3000)), RangeError);
});

test("the SVG path draws every dark module inside the quiet zone", () => {
  const matrix = encode("EQ-0001");
  const path = svgPath(matrix);
  assert.match(path, /^M4 4h7v1h-7z/u);
  const width = [...path.matchAll(/h(\d+)v1/gu)].reduce((n, m) => n + Number(m[1]), 0);
  assert.equal(width, matrix.flat().filter(Boolean).length);
});
