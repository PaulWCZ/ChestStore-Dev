import assert from "node:assert/strict";
import { test } from "node:test";
import { matcher } from "../lib/match.ts";

const people = [
  { id: "mbr_c", name: "Camille Martin", firstName: "Camille", lastName: "Martin", email: "camille@atelier.test" },
  { id: "mbr_i", name: "Inès Moreau", firstName: "Inès", lastName: "Moreau" },
  { id: "mbr_l1", name: "Léa Dubois", firstName: "Léa", lastName: "Dubois" },
  { id: "mbr_l2", name: "Lea Dubois", firstName: "Lea", lastName: "Dubois" },
];

test("names in the forms exports write them, addresses first, and no guess between two people", () => {
  const who = matcher(people);
  assert.equal(who({ name: "Camille Martin", address: null }), "mbr_c");
  assert.equal(who({ name: "Martin, Camille", address: null }), "mbr_c", "Outlook's Last, First");
  assert.equal(who({ name: "MARTIN Camille", address: null }), "mbr_c");
  assert.equal(who({ name: "Moreau, Ines (Sales)", address: null }), "mbr_i", "accents and a department aside");
  assert.equal(who({ name: "Someone Else", address: "CAMILLE@atelier.test" }), "mbr_c", "the address wins");
  assert.equal(who({ name: null, address: "ines.moreau@atelier.test" }), "mbr_i", "the address's local part as a name");
  assert.equal(who({ name: "Léa Dubois", address: null }), null, "two people answer to it: nobody");
  assert.equal(who({ name: "Dubois, Léa", address: null }), null);
  assert.equal(who("Camille Martin"), "mbr_c");
  assert.equal(who("camille@atelier.test"), "mbr_c");
  assert.equal(who(null), null);
  assert.equal(who({ name: "Martin", address: "martin@x.test" }), null, "a last name alone is not enough");
});
