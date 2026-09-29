import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { fold } from "./fold.ts";
import { accountCode, clean, country as checkCountry, email as checkEmail, limits, siren as checkSiren, siret as checkSiret, vatNumber as checkVat } from "./model.ts";
import { checkMapping, clientKindOf, countryOf, goodsOf, isImportKind, languageOf, mapRow, mappingReady, priceOf, readTable, vatRateOf, type ImportKind, type Mapped } from "./parse-import.ts";
import { roundDiv } from "./totals.ts";

// Bringing the clients and the catalogue from the previous tool, so
// switching costs an afternoon, not a week of typing: a spreadsheet (CSV)
// with its columns matched on the page. The file is read again here — the
// page's reading is never trusted —, every value checked as if typed by
// hand (SIREN and VAT keys, email, country, price, French VAT rate); a row
// that cannot come is left out and said (its line and why). What is here
// already is not doubled: a client with the same SIREN (or, without one,
// the same name), an item of the same name.

export type ImportReport = { created: number; duplicates: number; skipped: { line: number; error: string; values?: Record<string, number | string> }[] };

type Context = { tx: Query; actor: Member; currency: string; defaultLanguage: "en" | "fr"; names: Set<string>; sirens: Set<string>; count: number };

const frenchSpeaking = new Set(["FR", "BE", "CH", "LU", "MC"]);

async function importClient(ctx: Context, m: Mapped): Promise<"created" | "duplicate"> {
  const person = [m.firstName, m.lastName].filter(Boolean).join(" ");
  const kind = clientKindOf(m.kind) ?? (!m.name && person ? "person" : "company");
  const name = clean(m.name ?? person, limits.name);
  // A SIRET gives the SIREN it starts with.
  const siretDigits = m.siret ? checkSiret(m.siret) : "";
  const sirenDigits = m.siren ? checkSiren(m.siren) : siretDigits.slice(0, 9);
  if (sirenDigits ? ctx.sirens.has(sirenDigits) : ctx.names.has(fold(name))) return "duplicate";
  if (ctx.count >= limits.clients) throw new AppError("too_many", { max: limits.clients });
  const countryCode = m.country ? countryOf(m.country) ?? checkCountry(m.country) : "FR";
  const address = [m.address, m.address2].filter(Boolean).join("\n");
  const contact = m.contact ?? (kind === "company" && m.name && person ? person : "");
  const [row] = await ctx.tx<{ id: number }[]>`
    insert into clients ${ctx.tx({
      kind,
      name,
      contact: clean(contact, limits.contact, { optional: true }),
      email: checkEmail((m.email ?? "").split(/[;,\s]+/u)[0] ?? ""),
      phone: clean(m.phone ?? "", limits.phone, { optional: true }),
      address: clean(address, limits.address, { optional: true, multiline: true }),
      postcode: clean(m.postcode ?? "", limits.postcode, { optional: true }),
      city: clean(m.city ?? "", limits.city, { optional: true }),
      country: checkCountry(countryCode),
      delivery_address: clean(m.deliveryAddress ?? "", limits.address, { optional: true, multiline: true }),
      siren: sirenDigits,
      vat_number: checkVat(m.vatNumber ?? ""),
      language: languageOf(m.language) ?? (m.country ? (frenchSpeaking.has(countryCode) ? "fr" : "en") : ctx.defaultLanguage),
      account: accountCode(m.account),
      notes: clean(m.notes ?? "", limits.notes, { optional: true, multiline: true }),
      created_by: ctx.actor.id,
    })} returning id`;
  ctx.names.add(fold(name));
  if (sirenDigits) ctx.sirens.add(sirenDigits);
  ctx.count++;
  return row ? "created" : "duplicate";
}

async function importItem(ctx: Context, m: Mapped): Promise<"created" | "duplicate"> {
  const name = clean(m.name, limits.name);
  if (ctx.names.has(fold(name))) return "duplicate";
  if (ctx.count >= limits.items) throw new AppError("too_many", { max: limits.items });
  const rate = m.vatRate === undefined ? 2000 : vatRateOf(m.vatRate);
  if (rate === null) throw new AppError("rate_invalid");
  let price = m.unitPrice === undefined ? null : priceOf(m.unitPrice, ctx.currency);
  if (m.unitPrice !== undefined && price === null) throw new AppError("amount_invalid");
  if (price === null && m.priceInclVat !== undefined) {
    const gross = priceOf(m.priceInclVat, ctx.currency);
    if (gross === null) throw new AppError("amount_invalid");
    // Excluding VAT from a price including it: rounded once, to the cent.
    price = Number(roundDiv(BigInt(gross) * 10_000n, BigInt(10_000 + rate)));
  }
  if (price !== null && Math.abs(price) > limits.unitPrice) throw new AppError("amount_invalid");
  await ctx.tx`
    insert into items ${ctx.tx({
      name,
      description: clean(m.description ?? "", limits.description, { optional: true, multiline: true }),
      unit: clean(m.unit ?? "", limits.unit, { optional: true }),
      unit_price: price ?? 0,
      vat_rate: rate,
      goods: goodsOf(m.kind) ?? false,
      created_by: ctx.actor.id,
    })}`;
  ctx.names.add(fold(name));
  ctx.count++;
  return "created";
}

// importTable brings the rows of a file into the clients or the catalogue.
// Each row in its own savepoint: a refused row leaves the others.
export async function importTable(sql: Sql, actor: Member | null, kind: unknown, text: unknown, mapping: unknown, options: { currency: string; defaultLanguage: "en" | "fr" }): Promise<ImportReport> {
  if (!isImportKind(kind)) throw new AppError("import_invalid");
  if (!can(actor, kind === "clients" ? "clients.write" : "catalogue.write")) throw new AppError("forbidden");
  if (typeof text !== "string") throw new AppError("import_invalid");
  const table = readTable(text);
  const map = checkMapping(kind, table.head, mapping);
  if (!mappingReady(kind, map)) throw new AppError("import_invalid");
  return sql.begin(async tx => {
    const ctx = await context(tx, actor!, kind, options);
    const report: ImportReport = { created: 0, duplicates: 0, skipped: [] };
    for (const [i, raw] of table.rows.entries()) {
      const m = mapRow(raw, map);
      if (Object.keys(m).length === 0) continue;
      const before = { names: new Set(ctx.names), sirens: new Set(ctx.sirens), count: ctx.count };
      try {
        const done = await tx.savepoint(async sp => {
          ctx.tx = sp;
          return kind === "clients" ? importClient(ctx, m) : importItem(ctx, m);
        });
        if (done === "created") report.created++;
        else report.duplicates++;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        Object.assign(ctx, before);
        if (report.skipped.length < 200) report.skipped.push({ line: i + 2, error: error.code, ...(Object.keys(error.values).length ? { values: error.values } : {}) });
      } finally {
        ctx.tx = tx;
      }
    }
    return report;
  });
}

async function context(tx: Query, actor: Member, kind: ImportKind, options: { currency: string; defaultLanguage: "en" | "fr" }): Promise<Context> {
  if (kind === "clients") {
    const rows = await tx<{ name: string; siren: string }[]>`select name, siren from clients`;
    return { tx, actor, ...options, names: new Set(rows.map(r => fold(r.name))), sirens: new Set(rows.map(r => r.siren).filter(Boolean)), count: rows.length };
  }
  const rows = await tx<{ name: string; archived: boolean }[]>`select name, archived_at is not null as archived from items`;
  return { tx, actor, ...options, names: new Set(rows.map(r => fold(r.name))), sirens: new Set(), count: rows.filter(r => !r.archived).length };
}
