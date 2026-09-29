// The bank transfer file of a batch of reimbursements: a SEPA credit
// transfer initiation, ISO 20022 `pain.001.001.03` — the XML file French
// banks take for grouped transfers (CFONB's guide "Remises informatisées
// d'ordres de paiement, pain.001.001.03 & 09"; the EPC's "SEPA Credit
// Transfer Customer-to-PSP Implementation Guidelines", EPC132-08; sources
// and dates in THIRD_PARTY.md). Pure: no database, no Chest; tested alone.
//
// One payment (PmtInf) from the company's account, one transfer
// (CdtTrfTxInf) per person, in euros, service level SEPA, charges shared
// (SLEV). Texts are written in the SEPA basic Latin character set (a–z,
// A–Z, 0–9, / - ? : ( ) . , ' + and space): accents are taken off, anything
// else becomes a space.

// A postal address, written only when given: a transfer to a SEPA country
// outside the EEA carries the payee's and the payer's (lib/iban.ts,
// needsAddress).
export type PostalAddress = { street: string; postcode: string; town: string; country: string };
export type Transfer = { endToEnd: string; amount: number; name: string; iban: string; bic: string | null; text: string; address?: PostalAddress | null };
export type Pain001 = {
  messageId: string;
  createdAt: Date;
  payer: { name: string; iban: string; bic: string | null; address?: PostalAddress | null };
  executionDate: string;
  transfers: Transfer[];
};

// The characters every SEPA bank takes (EPC basic Latin set).
export function sepaText(text: string, max: number): string {
  const plain = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/ß/gu, "ss").replace(/[Ææ]/gu, m => (m === "Æ" ? "AE" : "ae")).replace(/[Œœ]/gu, m => (m === "Œ" ? "OE" : "oe")).replace(/[Øø]/gu, m => (m === "Ø" ? "O" : "o"))
    .replace(/&/gu, "+")
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  // Never starting or ending with "/", never "//" (EPC rules for identifiers).
  return plain.replace(/\/{2,}/gu, "/").replace(/^\/+|\/+$/gu, "").slice(0, max).trim();
}

// An identifier of the file (MsgId, EndToEndId): 35 characters at most,
// no spaces.
export function sepaId(text: string): string {
  return sepaText(text, 35).replace(/ /gu, "");
}

const escape = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");

// Euros with two decimals and a dot ("42.50").
export function sepaAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new RangeError("amount");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function agent(bic: string | null, required: boolean): string {
  if (bic) return `<FinInstnId><BIC>${escape(bic)}</BIC></FinInstnId>`;
  // The debtor's bank is required by the schema: without its BIC, the
  // EPC's "NOTPROVIDED" (the bank finds itself from the IBAN).
  return required ? "<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>" : "";
}

// A structured postal address (ISO 20022 PostalAddress6, in the schema's
// order: street, post code, town, country). Town and country are what the
// EPC's "hybrid" address makes mandatory; this file writes every part
// structured, never free address lines. Whether a bank still reading
// pain.001.001.03 with the EPC's older usage rules (country and two address
// lines only) takes it is not verified: README, "What it does not do".
export function postalAddress(address: PostalAddress | null | undefined): string {
  if (!address || !address.town || !/^[A-Z]{2}$/u.test(address.country)) return "";
  const parts = [
    address.street ? `<StrtNm>${escape(sepaText(address.street, 70))}</StrtNm>` : "",
    address.postcode ? `<PstCd>${escape(sepaText(address.postcode, 16))}</PstCd>` : "",
    `<TwnNm>${escape(sepaText(address.town, 35))}</TwnNm>`,
    `<Ctry>${address.country}</Ctry>`,
  ];
  return `<PstlAdr>${parts.join("")}</PstlAdr>`;
}

// The ISO date-time of the file, to the second, as the schema's
// ISODateTime (local time of the Chest, without zone).
function dateTime(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date).map(p => [p.type, p.value]));
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}T${parts["hour"]}:${parts["minute"]}:${parts["second"]}`;
}

export function pain001(file: Pain001, timeZone = "Europe/Paris"): string {
  if (file.transfers.length === 0) throw new RangeError("transfers");
  const total = file.transfers.reduce((sum, t) => sum + t.amount, 0);
  const count = String(file.transfers.length);
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">');
  lines.push("  <CstmrCdtTrfInitn>");
  lines.push("    <GrpHdr>");
  lines.push(`      <MsgId>${escape(sepaId(file.messageId))}</MsgId>`);
  lines.push(`      <CreDtTm>${dateTime(file.createdAt, timeZone)}</CreDtTm>`);
  lines.push(`      <NbOfTxs>${count}</NbOfTxs>`);
  lines.push(`      <CtrlSum>${sepaAmount(total)}</CtrlSum>`);
  lines.push(`      <InitgPty><Nm>${escape(sepaText(file.payer.name, 70))}</Nm></InitgPty>`);
  lines.push("    </GrpHdr>");
  lines.push("    <PmtInf>");
  lines.push(`      <PmtInfId>${escape(sepaId(file.messageId + "-1"))}</PmtInfId>`);
  lines.push("      <PmtMtd>TRF</PmtMtd>");
  lines.push(`      <NbOfTxs>${count}</NbOfTxs>`);
  lines.push(`      <CtrlSum>${sepaAmount(total)}</CtrlSum>`);
  lines.push("      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>");
  lines.push(`      <ReqdExctnDt>${file.executionDate}</ReqdExctnDt>`);
  lines.push(`      <Dbtr><Nm>${escape(sepaText(file.payer.name, 70))}</Nm>${postalAddress(file.payer.address)}</Dbtr>`);
  lines.push(`      <DbtrAcct><Id><IBAN>${escape(file.payer.iban)}</IBAN></Id></DbtrAcct>`);
  lines.push(`      <DbtrAgt>${agent(file.payer.bic, true)}</DbtrAgt>`);
  lines.push("      <ChrgBr>SLEV</ChrgBr>");
  for (const t of file.transfers) {
    lines.push("      <CdtTrfTxInf>");
    lines.push(`        <PmtId><EndToEndId>${escape(sepaId(t.endToEnd))}</EndToEndId></PmtId>`);
    lines.push(`        <Amt><InstdAmt Ccy="EUR">${sepaAmount(t.amount)}</InstdAmt></Amt>`);
    if (t.bic) lines.push(`        <CdtrAgt>${agent(t.bic, false)}</CdtrAgt>`);
    lines.push(`        <Cdtr><Nm>${escape(sepaText(t.name, 70) || "-")}</Nm>${postalAddress(t.address)}</Cdtr>`);
    lines.push(`        <CdtrAcct><Id><IBAN>${escape(t.iban)}</IBAN></Id></CdtrAcct>`);
    const text = sepaText(t.text, 140);
    if (text) lines.push(`        <RmtInf><Ustrd>${escape(text)}</Ustrd></RmtInf>`);
    lines.push("      </CdtTrfTxInf>");
  }
  lines.push("    </PmtInf>");
  lines.push("  </CstmrCdtTrfInitn>");
  lines.push("</Document>");
  return lines.join("\n") + "\n";
}
