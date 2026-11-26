import { readFileSync } from "node:fs";
import { join } from "node:path";
import { winAnsiHigh, type FontName } from "./metrics.ts";
import { TrueType } from "./truetype.ts";

// The font files the documents embed (src/pdf/fonts/, SIL Open Font
// License, LICENSE-liberation.txt): Liberation Sans for Helvetica,
// Liberation Serif for Times — the same widths, so a document is laid out
// as it always was. Read once per process, from the tool's own folder.
const files: Record<FontName, { file: string; serif: boolean; italic: boolean; bold: boolean }> = {
  Helvetica: { file: "LiberationSans-Regular.ttf", serif: false, italic: false, bold: false },
  "Helvetica-Bold": { file: "LiberationSans-Bold.ttf", serif: false, italic: false, bold: true },
  "Times-Roman": { file: "LiberationSerif-Regular.ttf", serif: true, italic: false, bold: false },
  "Times-Bold": { file: "LiberationSerif-Bold.ttf", serif: true, italic: false, bold: true },
  "Times-Italic": { file: "LiberationSerif-Italic.ttf", serif: true, italic: true, bold: false },
};

export type LoadedFont = { font: TrueType; serif: boolean; italic: boolean; bold: boolean; widths: number[] };

// The directory of the font files: the tool's src/pdf/fonts, from where the
// server runs (the tool's folder, as `npm start` and `npm test` do).
export const fontDirectory = (): string => process.env["QUOTES_FONT_DIR"] ?? join(process.cwd(), "src", "pdf", "fonts");

const loaded = new Map<FontName, LoadedFont>();

// The Unicode character of each WinAnsi code (32 to 255).
export function winAnsiUnicode(code: number): number {
  return winAnsiHigh[code] ?? code;
}

export function loadFont(name: FontName): LoadedFont {
  let found = loaded.get(name);
  if (!found) {
    const spec = files[name];
    const font = new TrueType(readFileSync(join(fontDirectory(), spec.file)));
    const widths: number[] = [];
    for (let code = 32; code <= 255; code++) {
      const defined = code < 127 || code > 159 || winAnsiHigh[code] !== undefined;
      widths.push(defined ? font.width(font.glyphOf(winAnsiUnicode(code))) : 0);
    }
    found = { font, ...spec, widths };
    loaded.set(name, found);
  }
  return found;
}
