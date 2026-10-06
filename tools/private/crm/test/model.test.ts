import assert from "node:assert/strict";
import { test } from "node:test";
import { amountInput, parseAmount } from "../src/shared/amount.ts";
import { AppError } from "../src/shared/app-error.ts";
import { fold, key } from "../src/shared/fold.ts";
import { addDays, clean, day, domainOf, dueState, email, monthOf, nextWorkday, owner, phone, phoneHref, tags, website, websiteHref } from "../src/shared/model.ts";

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("texts are trimmed, bounded, and keep lines only where they may", () => {
  assert.equal(clean("  Acme\n  SAS ", 20), "Acme SAS");
  assert.equal(clean("a\r\nb\u0007", 20, { multiline: true }), "a\nb");
  assert.throws(() => clean("   ", 10), refused("empty"));
  assert.equal(clean(undefined, 10, { optional: true }), "");
  assert.throws(() => clean("x".repeat(11), 10), refused("too_long"));
  assert.throws(() => clean(42, 10), refused("invalid"));
});

test("emails, websites, phones and owners are checked", () => {
  assert.equal(email(" Claire.Durand@Durand.FR "), "claire.durand@durand.fr");
  assert.equal(email(""), "");
  assert.throws(() => email("claire@"), refused("bad_email"));
  assert.throws(() => email("a b@c.fr"), refused("bad_email"));
  assert.equal(website("https://durand.fr/"), "https://durand.fr");
  assert.equal(website("www.durand.fr"), "www.durand.fr");
  assert.throws(() => website("javascript:alert(1)"), refused("invalid"));
  assert.throws(() => website("not a site"), refused("invalid"));
  assert.equal(websiteHref("durand.fr"), "https://durand.fr");
  assert.equal(domainOf("https://www.Durand.fr/contact"), "durand.fr");
  assert.equal(domainOf("claire@durand.fr"), "durand.fr");
  assert.equal(phone("+33 (0)1 23-45.67/89"), "+33 (0)1 23-45.67/89");
  assert.throws(() => phone("call me"), refused("invalid"));
  assert.equal(phoneHref("+33 1 23 45 67 89"), "tel:+33123456789");
  assert.equal(owner(""), null);
  assert.throws(() => owner("camille"), refused("invalid"));
});

test("tags: a list or commas, each once whatever its case, bounded", () => {
  assert.deepEqual(tags("Retail, #vip, retail , "), ["Retail", "vip"]);
  assert.deepEqual(tags(["a", "B"]), ["a", "B"]);
  assert.throws(() => tags("x".repeat(31)), refused("too_long"));
  assert.throws(() => tags(Array.from({ length: 21 }, (_, i) => "t" + i)), refused("too_many"));
  assert.throws(() => tags(3), refused("invalid"));
});

test("days: real calendar days only; late, today, soon; months; workdays", () => {
  assert.equal(day("2026-02-28"), "2026-02-28");
  assert.throws(() => day("2026-02-30"), refused("bad_date"));
  assert.throws(() => day("", { required: true }), refused("bad_date"));
  assert.equal(day(""), null);
  assert.equal(dueState("2026-09-27", "2026-09-28"), "late");
  assert.equal(dueState("2026-09-28", "2026-09-28"), "today");
  assert.equal(dueState("2026-10-05", "2026-09-28"), "soon");
  assert.equal(dueState("2026-10-06", "2026-09-28"), "later");
  assert.deepEqual(monthOf("2026-02-14"), { first: "2026-02-01", last: "2026-02-28" });
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(nextWorkday("2026-10-02"), "2026-10-05"); // Friday → Monday
});

test("amounts are read as people write them, into whole cents, never through a float", () => {
  assert.equal(parseAmount("12500"), 1250000);
  assert.equal(parseAmount("12 500,50 €"), 1250050);
  assert.equal(parseAmount("€12,500.50"), 1250050);
  assert.equal(parseAmount("12.500,50"), 1250050);
  assert.equal(parseAmount("12,500"), 1250000);
  assert.equal(parseAmount("1.250.000"), 125000000);
  assert.equal(parseAmount("12,5"), 1250);
  assert.equal(parseAmount("12k"), 1200000);
  assert.equal(parseAmount("0.1"), 10);
  assert.equal(parseAmount(""), 0);
  assert.equal(parseAmount(19.99), 1999);
  assert.throws(() => parseAmount("-5"), refused("bad_amount"));
  assert.throws(() => parseAmount("12,345,6"), refused("bad_amount"));
  assert.throws(() => parseAmount("ten"), refused("bad_amount"));
  assert.throws(() => parseAmount("9".repeat(16)), refused("bad_amount"));
  assert.equal(amountInput(1250050), "12500.50");
  assert.equal(amountInput(1250000), "12500");
  assert.equal(parseAmount(amountInput(123456)), 123456);
});

test("folding compares names as people mean them", () => {
  assert.equal(fold("  Société   GÉNÉRALE! "), "societe generale");
  assert.equal(key("Person - Email - Work"), "personemailwork");
});
