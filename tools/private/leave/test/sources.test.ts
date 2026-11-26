import { test } from "node:test";
import { atLeast, checkSources, checkWords } from "@argentic/chest-app/testing";
import { catalogue, locales } from "../src/i18n/index.ts";

// The package's checks of a tool's sources: no style={}, no server code in
// an island or a shared component, no colour in the CSS, no class defined
// nowhere, each capability declared and used, every src/lib/ module
// tested; and every word in every language, with its placeholders and
// French typography.
atLeast(2);

test("the sources keep the package's rules", () => {
  checkSources({ requireTests: true });
});

test("every language says every text", () => {
  checkWords(Object.fromEntries(locales.map(l => [l, catalogue(l)])));
});
