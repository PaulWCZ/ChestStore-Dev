import assert from "node:assert/strict";
import { test } from "node:test";
import { atLeast, checkSources, checkWords } from "@argentic/chest-app/testing";
import { checkTheme, validateTheme } from "@argentic/chest-ui/contract";
import { catalogues } from "../src/i18n/index.ts";
import { mayChange } from "../src/lib/notes.ts";
import { identity } from "../src/theme.ts";

// What a type cannot check, read in the sources (Node runs .ts as is).
atLeast(4);

test("every language says every text, with the same {placeholders}; French typography", () => {
  checkWords(catalogues);
});

test("the sources: no style={}, no server code in islands, no colour in CSS, known classes, capabilities used and declared", () => {
  checkSources();
});

test("the look passes the kit's contract", () => {
  assert.deepEqual(validateTheme(identity), []);
  assert.deepEqual(checkTheme(identity), []);
});

// EXAMPLE (Notes)
test("a note is changed by its author, an admin, or anyone for a visitor's", () => {
  const camille = { id: "mbr_camillecamillecamillecami", isAdmin: false } as Parameters<typeof mayChange>[0];
  assert.equal(mayChange(camille, { author: camille.id }), true);
  assert.equal(mayChange(camille, { author: "mbr_someoneelsesomeoneelsesom" }), false);
  assert.equal(mayChange({ ...camille, isAdmin: true }, { author: "mbr_someoneelsesomeoneelsesom" }), true);
  assert.equal(mayChange(camille, { author: null }), true);
});
