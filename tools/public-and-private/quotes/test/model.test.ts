import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../src/shared/app-error.ts";
import { addDays, bic, clean, day, documentNumber, email, frenchVatNumber, iban, luhn, prefix, siren, siret, slug, vatNumber } from "../src/shared/model.ts";

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("SIREN and SIRET: 9 and 14 digits passing Luhn, spaces allowed", () => {
  assert.ok(luhn("853128940"));
  assert.equal(siren("853 128 940"), "853128940");
  assert.equal(siren(""), "");
  assert.throws(() => siren("853128941"), refused("siren_invalid"));
  assert.throws(() => siren("12345"), refused("siren_invalid"));
  assert.equal(siret("853 128 940 00014"), "85312894000014");
  assert.throws(() => siret("85312894000015"), refused("siret_invalid"));
});

test("VAT numbers: a French key is checked against its SIREN", () => {
  assert.equal(frenchVatNumber("853128940"), "FR25853128940");
  assert.equal(vatNumber("fr 25 853 128 940"), "FR25853128940");
  assert.throws(() => vatNumber("FR26853128940"), refused("vat_number_invalid"));
  assert.equal(vatNumber("BE0477472701"), "BE0477472701");
  assert.equal(vatNumber(""), "");
  assert.throws(() => vatNumber("123"), refused("vat_number_invalid"));
});

test("IBAN by its key, BIC by its shape, email by its shape", () => {
  assert.equal(iban("fr7630006000011234567890189"), "FR76 3000 6000 0112 3456 7890 189");
  assert.throws(() => iban("FR7630006000011234567890188"), refused("iban_invalid"));
  assert.equal(bic("agrifrpp"), "AGRIFRPP");
  assert.equal(bic("AGRIFRPPXXX"), "AGRIFRPPXXX");
  assert.throws(() => bic("AGRI"), refused("bic_invalid"));
  assert.equal(email(" a@b.fr "), "a@b.fr");
  assert.throws(() => email("a@b"), refused("email_invalid"));
});

test("numbers, prefixes, dates and texts", () => {
  assert.equal(documentNumber("F", 2026, 42), "F-2026-0042");
  assert.equal(documentNumber("F", 2026, 12345), "F-2026-12345");
  assert.equal(prefix(" fac "), "FAC");
  assert.throws(() => prefix("F-1"), refused("prefix_invalid"));
  assert.equal(day("2026-02-28"), "2026-02-28");
  assert.throws(() => day("2026-02-30"), refused("date_invalid"));
  assert.equal(addDays("2026-09-28", 30), "2026-10-28");
  assert.equal(clean("  a\n  b ", 10), "a b");
  assert.equal(clean("a\r\n\n\n\nb", 10, { multiline: true }), "a\n\nb");
  assert.throws(() => clean("abc", 2), refused("too_long"));
  assert.equal(slug("Facture d’acompte F-2026"), "Facture-d-acompte-F-2026");
});
