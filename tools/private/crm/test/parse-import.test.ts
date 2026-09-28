import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../lib/app-error.ts";
import { dayOf, endOf, firstName, guessMapping, mapRow, readTable } from "../lib/parse-import.ts";

test("HubSpot's exports: their headers find their fields", () => {
  assert.deepEqual(guessMapping("contacts", ["Record ID", "First Name", "Last Name", "Email", "Phone Number", "Mobile Phone Number", "Job Title", "Associated Company", "Contact owner", "Lifecycle Stage"]),
    ["", "firstName", "lastName", "email", "phone", "", "title", "company", "owner", ""]);
  assert.deepEqual(guessMapping("companies", ["Record ID", "Company name", "Company Domain Name", "Phone Number", "Industry", "Street Address", "City", "Postal Code", "Country/Region", "Company owner"]),
    ["", "name", "website", "phone", "industry", "address", "city", "postcode", "country", "owner"]);
  assert.deepEqual(guessMapping("deals", ["Record ID", "Deal Name", "Deal Stage", "Amount", "Close Date", "Deal owner", "Pipeline", "Associated Company", "Associated Contact", "Closed Lost Reason"]),
    ["", "title", "stage", "value", "closeDate", "owner", "", "company", "contact", "reason"]);
});

test("Pipedrive's exports (English and French) and French spreadsheets", () => {
  assert.deepEqual(guessMapping("deals", ["Deal - Title", "Deal - Value", "Deal - Currency", "Deal - Organization", "Deal - Contact person", "Deal - Stage", "Deal - Status", "Deal - Owner", "Deal - Expected close date", "Deal - Lost reason"]),
    ["title", "value", "", "company", "contact", "stage", "status", "owner", "closeDate", "reason"]);
  assert.deepEqual(guessMapping("contacts", ["Person - Name", "Person - Organization", "Person - Email - Work", "Person - Email - Home", "Person - Phone - Work", "Person - Labels", "Person - Owner"]),
    ["name", "company", "email", "", "phone", "tags", "owner"]);
  assert.deepEqual(guessMapping("companies", ["Organisation - Nom", "Organization - Address", "Organization - Owner", "Organization - Labels"]),
    ["name", "address", "owner", "tags"]);
  assert.deepEqual(guessMapping("contacts", ["Prénom", "Nom de famille", "Adresse e-mail", "Téléphone portable", "Fonction", "Société"]),
    ["firstName", "lastName", "email", "phone", "title", "company"]);
});

test("a table: headers, rows, French separators; values as exports write them", () => {
  const t = readTable("﻿Nom;E-mail\n\"Durand; Claire\";claire@durand.fr\n\n");
  assert.deepEqual(t, { head: ["Nom", "E-mail"], rows: [["Durand; Claire", "claire@durand.fr"]] });
  assert.throws(() => readTable("only,a,header\n"), (e: unknown) => e instanceof AppError && e.code === "import_empty");
  assert.deepEqual(mapRow(["  Acme ", "", "x"], ["name", "website", ""]), { name: "Acme" });
  assert.equal(firstName("Acme SAS (1234567); Other (99)"), "Acme SAS");
  assert.equal(dayOf("2026-11-03 14:20"), "2026-11-03");
  assert.equal(dayOf("03/11/2026"), "2026-11-03");
  assert.equal(dayOf("31/02/2026"), null);
  assert.equal(endOf("Closed Won"), "won");
  assert.equal(endOf("closedlost"), "lost");
  assert.equal(endOf("Perdue"), "lost");
  assert.equal(endOf("Gagnée"), "won");
  assert.equal(endOf("open"), null);
  assert.equal(endOf("Proposal"), null);
});
