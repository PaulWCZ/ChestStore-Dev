import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../src/shared/app-error.ts";
import { fold, parseVcards, toVcard } from "../src/shared/vcard.ts";

test("vCard 3.0 as phones write it: folded lines, escapes, several addresses, groups", () => {
  const text = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Durand;Claire;;;",
    "FN:Claire Durand",
    "ORG:Boulangeries Durand\\, SAS;Achats",
    "TITLE:Responsable des achats",
    "item1.EMAIL;TYPE=INTERNET,HOME:claire@gmail.com",
    "EMAIL;TYPE=INTERNET,WORK,pref:claire.durand@durand.fr",
    "TEL;TYPE=CELL:+33 6 12 34 56 78",
    "NOTE:Rencontrée au salon\\nPréfère le matin\; ",
    " appeler avant 10 h",
    "CATEGORIES:VIP,Salon 2026",
    "PHOTO;ENCODING=b;TYPE=JPEG:AAAA",
    "END:VCARD",
    "",
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Lefèvre;Marc;;;",
    "END:VCARD",
  ].join("\r\n");
  const [claire, marc] = parseVcards(text);
  assert.deepEqual(claire, {
    name: "Claire Durand",
    email: "claire.durand@durand.fr",
    phone: "+33 6 12 34 56 78",
    title: "Responsable des achats",
    company: "Boulangeries Durand, SAS",
    notes: "Rencontrée au salon\nPréfère le matin; appeler avant 10 h",
    tags: ["VIP", "Salon 2026"],
  });
  assert.equal(marc?.name, "Marc Lefèvre");
});

test("vCard 4.0 and 2.1 quoted-printable; a file without a card is refused", () => {
  const four = "BEGIN:VCARD\nVERSION:4.0\nFN:Hélène Roux\nTEL;VALUE=uri;TYPE=work:tel:+33-1-23-45-67-89\nEND:VCARD\n";
  assert.equal(parseVcards(four)[0]?.phone, "+33-1-23-45-67-89");
  const old = "BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ch=C3=A9rif;Nad=\r\nia;;;\r\nTEL;WORK;VOICE:01 23 45 67 89\r\nEND:VCARD\r\n";
  const [nadia] = parseVcards(old);
  assert.equal(nadia?.name, "Nadia Chérif");
  assert.equal(nadia?.phone, "01 23 45 67 89");
  assert.throws(() => parseVcards("hello"), (e: unknown) => e instanceof AppError && e.code === "vcard_invalid");
});

test("writing 4.0: escapes, CRLF, lines folded at 75 octets without cutting a character, read back the same", () => {
  const card = { name: "Élodie Fontaine-Larivière", email: "elodie@fontaine.fr", phone: "06 11 22 33 44", title: "Directrice, achats; logistique", company: "Fontaine & Fils", notes: "Line one\nLine two — ".repeat(6).trim(), tags: ["vip", "salon, 2026"] };
  const text = toVcard(card);
  assert.ok(text.startsWith("BEGIN:VCARD\r\nVERSION:4.0\r\n"));
  const unfolded = text.replace(/\r\n /gu, "");
  assert.ok(unfolded.includes("N:Fontaine-Larivière;Élodie;;;"));
  assert.ok(unfolded.includes("TITLE:Directrice\\, achats\\; logistique"));
  for (const line of text.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const [back] = parseVcards(text);
  assert.deepEqual(back, card);
  assert.equal(fold("é".repeat(50)).split("\r\n ").join(""), "é".repeat(50));
});
