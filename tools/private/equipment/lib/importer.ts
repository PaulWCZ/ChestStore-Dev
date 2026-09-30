import { chest } from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { parseCsv } from "./csv.ts";
import type { Query, Sql } from "./db.ts";
import { catalogue, locales } from "./i18n/index.ts";
import { addMonths, clean, day, fieldValue, fold, limits, makeTag, money, statuses, tag as readTag, type CategoryKey, type FieldType, type Kind, type Status } from "./model.ts";
import { allFields, namesOf, type Field as CategoryField } from "./fields.ts";
import { everyone, type Colleague } from "./people.ts";

// Import from Snipe-IT's CSV (its Custom Asset Report, its assets list's
// export, or the file one imports into it — test/fixtures/ has one of each,
// their columns taken from Snipe-IT's source, see THIRD_PARTY.md) and from
// any spreadsheet saved as CSV, columns found by their names in English or
// French — this tool's own export included. Other columns — Snipe-IT's
// custom fields (IMEI, RAM…), a spreadsheet's own — become fields of the
// categories they have values for, when the manager keeps them. People are
// matched by name (or the name part of an address) to the Chest's members;
// a person not found leaves the item in stock, said in the preview. A row
// whose asset tag (or serial number) is already here is left out: importing
// the same file twice adds nothing. The page shows the plan first; the
// import reads the file again on the server.

// "intune": the devices Microsoft Intune knows and Equipment does not, as
// lib/intune.ts writes them (columns in English).
export type Source = "snipe" | "csv" | "intune";
export const isSource = (value: unknown): value is Source => value === "snipe" || value === "csv" || value === "intune";

type Field =
  | "tag" | "name" | "model" | "manufacturer" | "category" | "serial" | "status"
  | "holder" | "holderFirst" | "holderLast" | "holderEmail" | "holderUser" | "place" | "location" | "since"
  | "purchasedOn" | "price" | "supplier" | "warrantyUntil" | "warrantyMonths" | "notes"
  | "seats" | "renewsOn" | "cost" | "period" | "checkoutType" | "quantity" | "minQuantity";

// Header words, folded (lower case, no accents, anything else a space).
const aliases: Record<Field, string[]> = {
  tag: ["asset tag", "tag", "asset number", "asset no", "asset id", "inventory number", "inventory tag", "etiquette", "n inventaire", "no inventaire", "numero d inventaire", "numero inventaire", "code inventaire"],
  name: ["name", "asset name", "item", "item name", "nom", "designation", "libelle", "materiel", "article", "equipement"],
  model: ["model", "model name", "modele"],
  manufacturer: ["manufacturer", "brand", "make", "fabricant", "marque", "constructeur"],
  category: ["category", "type", "kind", "asset type", "categorie", "famille", "type de materiel"],
  serial: ["serial", "serial number", "serial no", "s n", "sn", "numero de serie", "n de serie", "no de serie", "num serie", "serie"],
  status: ["status", "status label", "state", "statut", "etat"],
  holder: ["checked out to", "checked out", "assigned to", "holder", "user", "employee", "owner", "person", "custodian", "utilisateur", "attribue a", "affecte a", "detenteur", "collaborateur", "salarie", "titulaire", "porteur"],
  holderFirst: ["checked out to first name", "first name", "firstname", "prenom"],
  holderLast: ["checked out to last name", "last name", "lastname", "surname", "nom de famille"],
  holderEmail: ["checked out to email", "email", "e mail", "mail", "courriel", "adresse e mail", "adresse mail"],
  holderUser: ["checked out to username", "username", "login", "identifiant"],
  place: ["checkout location", "checked out to location", "place", "room", "emplacement", "lieu", "salle", "piece"],
  location: ["location", "default location", "localisation", "site"],
  since: ["since", "checkout date", "last checkout", "checked out on", "assigned on", "depuis", "date d attribution", "attribue le"],
  purchasedOn: ["purchase date", "purchased", "purchased on", "bought on", "date of purchase", "order date", "date d achat", "achete le", "date achat"],
  price: ["purchase cost", "price", "cost", "value", "purchase price", "amount", "prix", "prix d achat", "cout", "valeur", "montant"],
  supplier: ["supplier", "vendor", "seller", "reseller", "fournisseur", "vendeur", "revendeur"],
  warrantyUntil: ["warranty until", "warranty end", "warranty expires", "warranty expiration", "warranty expiration date", "warranty expiry", "end of warranty", "fin de garantie", "garantie jusqu au", "date de fin de garantie", "expiration garantie", "garanti jusqu au"],
  warrantyMonths: ["warranty", "warranty months", "warranty (months)", "garantie", "garantie mois", "duree de garantie", "garantie (mois)"],
  notes: ["notes", "asset notes", "note", "comments", "comment", "remarks", "remarques", "commentaire", "commentaires", "observations"],
  seats: ["seats", "licenses", "licences", "number of seats", "total seats", "sieges", "postes", "nombre de licences", "nombre de postes"],
  renewsOn: ["renewal", "renewal date", "renews on", "expiration date", "expires", "renouvellement", "date de renouvellement", "echeance", "expiration"],
  cost: ["cost per period", "subscription cost", "recurring cost", "cout par periode", "cout de l abonnement", "cout recurrent"],
  period: ["period", "billing", "billing period", "billing cycle", "periodicite", "periode", "facturation"],
  // Snipe-IT: whether "Checked Out To" names a user, a location or an asset.
  checkoutType: ["checkout type", "checked out type", "type d attribution"],
  quantity: ["quantity", "qty", "quantite", "qte", "in stock", "en stock", "stock"],
  minQuantity: ["min qty", "min quantity", "minimum quantity", "minimum", "stock minimum", "seuil", "seuil d alerte", "quantite minimum"],
};

// Columns of Snipe-IT's own exports that are not worth a field here (who
// made the row, depreciation, the user's address…): never offered as
// fields. Folded like the headers.
const notFields = new Set([
  "id", "company", "asset company", "model no", "model number", "model notes", "eol", "eol date", "eol rate", "asset eol date", "current value", "diff",
  "fully depreciated", "address", "city", "state", "country", "zip", "type", "checked out asset tag", "user company", "employee no", "employee number",
  "manager", "department", "title", "phone", "user address", "user city", "user state", "user country", "user zip", "last checkin date",
  "expected checkin date", "created at", "updated at", "deleted", "deleted at", "last audit", "next audit date", "url", "checkouts", "checkins",
  "requests", "image", "device image", "age", "requestable", "created by", "byod", "default location", "asset serial", "icon", "share this template",
  "currency", "devise", "seats used", "postes utilises", "location", "localisation",
]);

const headerKey = (text: string) => fold(text).replace(/[^a-z0-9]+/gu, " ").trim();

// This tool's own export, in every language, reads back.
function ownHeaders(): Record<string, Field> {
  const map: Record<string, Field> = {};
  const fields: Record<string, Field | null> = { tag: "tag", name: "name", category: "category", status: "status", holder: "holder", place: "place", since: "since", serial: "serial", bought: "purchasedOn", price: "price", currency: null, supplier: "supplier", warranty: "warrantyUntil", seats: "seats", seatsUsed: null, renews: "renewsOn", cost: "cost", period: "period", quantity: "quantity", minimum: "minQuantity", notes: "notes" };
  for (const locale of locales) {
    for (const [key, text] of Object.entries(catalogue(locale).export.headers)) {
      const field = fields[key];
      if (field) map[headerKey(text)] ??= field;
    }
  }
  return map;
}

type Header = { found: Partial<Record<Field, number>>; ignored: string[]; custom: { index: number; name: string }[] };

function readHeader(header: string[], source: Source): Header {
  const own = ownHeaders();
  const found: Partial<Record<Field, number>> = {};
  const ignored: string[] = [];
  const custom: { index: number; name: string }[] = [];
  header.forEach((cell, index) => {
    const key = headerKey(cell);
    if (!key) return;
    // Snipe-IT's Custom Asset Report writes "Notes" twice: the user's notes
    // first, the asset's last — the asset's are the ones kept.
    if (key === "notes" && source === "snipe" && found.notes !== undefined) {
      ignored.push(header[found.notes]!.trim());
      found.notes = index;
      return;
    }
    // Snipe-IT's "State" is part of an address, never the asset's status.
    let field = source === "snipe" && key === "state" ? undefined : (Object.entries(aliases) as [Field, string[]][]).find(([f, words]) => found[f] === undefined && words.includes(key))?.[0];
    if (!field && own[key] && found[own[key]!] === undefined) field = own[key];
    // Snipe-IT's "Location" is where an asset lives by default, not whom it
    // was given to; a spreadsheet's "Location" is where the thing is.
    if (field === "location") field = source === "csv" && found.place === undefined ? "place" : undefined;
    // Snipe-IT's report says in a "Type" column what "Checked Out" names.
    if (!field && key === "type" && source === "snipe" && found.checkoutType === undefined) field = "checkoutType";
    if (field) found[field] = index;
    else if (!notFields.has(key) && !Object.values(aliases).some(words => words.includes(key)) && !own[key]) custom.push({ index, name: cell.trim().slice(0, limits.fieldName) });
    else ignored.push(cell.trim());
  });
  // A French "Nom" beside a "Prénom" is the holder's last name.
  if (found.holderFirst !== undefined && found.holderLast === undefined && found.name !== undefined && headerKey(header[found.name] ?? "") === "nom") {
    found.holderLast = found.name;
    delete found.name;
  }
  return { found, ignored: ignored.filter(Boolean), custom: custom.filter(c => c.name !== "") };
}

// ---- Values ---------------------------------------------------------------

// Dates as spreadsheets write them: 2024-03-18, 18/03/2024, 3/18/24.
const datePattern = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/u;
function dateOrder(values: string[], fallback: "dmy" | "mdy"): "dmy" | "mdy" {
  let dmy = false, mdy = false;
  for (const v of values) {
    const m = datePattern.exec(v.trim().replace(/[T ].*$/u, ""));
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  return mdy && !dmy ? "mdy" : dmy && !mdy ? "dmy" : fallback;
}
export function readDate(value: string, order: "dmy" | "mdy"): string | null {
  const text = value.trim().replace(/[T ].*$/u, "");
  if (!text) return null;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/u.test(text)) {
    const [y, mo, d] = text.split("-");
    return day(`${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`);
  }
  const m = datePattern.exec(text);
  if (!m) throw new AppError("invalid_date");
  const [d, mo] = order === "dmy" ? [m[1]!, m[2]!] : [m[2]!, m[1]!];
  const year = m[3]!.length === 2 ? (Number(m[3]) <= 69 ? 2000 : 1900) + Number(m[3]) : Number(m[3]);
  return day(`${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`);
}

const plain = (text: string) => fold(text).replace(/[^a-z0-9]+/gu, " ").trim();
const singular = (text: string) => text.split(" ").map(w => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)).join(" ");

const categoryWords: Record<CategoryKey, string[]> = {
  laptop: ["laptop", "notebook", "computer", "ordinateur", "ordinateur portable", "portable", "pc portable", "pc", "macbook", "desktop", "poste de travail", "ordi"],
  phone: ["phone", "mobile", "smartphone", "telephone", "mobile phone", "cell phone", "iphone", "telephone portable", "portable telephone"],
  screen: ["screen", "monitor", "display", "ecran", "moniteur"],
  accessory: ["accessory", "accessorie", "accessoire", "peripheral", "peripherique", "keyboard", "mouse", "dock", "headset", "casque", "clavier", "souris", "cable", "charger", "chargeur"],
  licence: ["licence", "license", "software", "logiciel", "subscription", "abonnement", "saas", "software license"],
  key: ["key", "badge", "cle", "clef", "access card", "carte d acce", "keys and badge", "cles et badge", "keycard"],
  vehicle: ["vehicle", "car", "vehicule", "voiture", "van", "scooter", "utilitaire"],
  other: ["other", "autre", "misc", "divers"],
  consumable: ["consumable", "supplies", "supply", "consommable", "fourniture", "fournitures"],
};

export type CategoryRef = { id: string; key: CategoryKey | null; name: string | null; kind: Kind };

function categoryMatcher(existing: CategoryRef[]) {
  const index = new Map<string, CategoryRef>();
  const add = (text: string, c: CategoryRef) => {
    const k = singular(plain(text));
    if (k && !index.has(k)) index.set(k, c);
  };
  for (const c of existing) if (c.name) add(c.name, c);
  for (const c of existing) {
    if (!c.key) continue;
    for (const locale of locales) add(catalogue(locale).categories[c.key], c);
    for (const word of categoryWords[c.key]) add(word, c);
  }
  return (text: string): CategoryRef | null => index.get(singular(plain(text))) ?? null;
}

const statusWords: [Status, string[]][] = [
  ["lost", ["lost", "stolen", "lost stolen", "perdu", "vole", "perdu vole", "missing", "disparu"]],
  ["retired", ["archived", "retired", "disposed", "sold", "scrapped", "rebut", "reforme", "archive", "vendu", "hors service", "hs", "recycle", "end of life"]],
  ["in_repair", ["repair", "out for repair", "broken", "maintenance", "reparation", "en reparation", "en panne", "panne", "sav", "defective", "defectueux"]],
  ["in_stock", ["ready to deploy", "ready", "available", "pending", "in stock", "stock", "deployable", "disponible", "en stock", "neuf", "new", "spare", "reserve"]],
  ["in_use", ["deployed", "in use", "assigned", "checked out", "attribue", "en service", "utilise", "en cours d utilisation", "affecte", "active", "actif"]],
];
function readStatus(text: string): Status | null {
  const k = plain(text);
  if (!k) return null;
  for (const locale of locales) for (const s of statuses) if (plain(catalogue(locale).status[s]) === k) return s;
  for (const [status, words] of statusWords) if (words.includes(k)) return status;
  for (const [status, words] of statusWords) if (words.some(w => w.length > 3 && k.includes(w))) return status;
  return null;
}

function readPeriod(text: string): "month" | "year" | null {
  const k = plain(text);
  if (!k) return null;
  if (/month|mensuel|mois|monthly/u.test(k)) return "month";
  if (/year|annu|an\b|yearly|annee/u.test(k)) return "year";
  for (const locale of locales) {
    if (plain(catalogue(locale).periods.month) === k) return "month";
    if (plain(catalogue(locale).periods.year) === k) return "year";
  }
  return null;
}

// Names of the Chest's members, folded, both ways round.
function nameIndex(people: Colleague[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (key: string, id: string) => {
    if (!key) return;
    const list = index.get(key) ?? [];
    if (!list.includes(id)) index.set(key, [...list, id]);
  };
  for (const p of people) {
    add(plain(p.name), p.id);
    add(plain(`${p.firstName} ${p.lastName}`), p.id);
    add(plain(`${p.lastName} ${p.firstName}`), p.id);
  }
  return index;
}

// The member a name designates, when exactly one has it (Intune's user of a
// device): the same matching as an import's.
export function personByName(people: Colleague[]): (name: string) => string | null {
  const index = nameIndex(people);
  return name => {
    const found = index.get(plain(name)) ?? [];
    return found.length === 1 ? found[0]! : null;
  };
}

// ---- The plan -------------------------------------------------------------

export type RowProblem = { code: "holder_not_found" | "holder_ambiguous" | "bad_date" | "bad_price" | "bad_tag" | "bad_seats" | "bad_field" | "bad_quantity"; name?: string };
export type PlanRow = {
  line: number;
  skip: "exists" | "duplicate" | "no_name" | null;
  tag: string | null;
  name: string;
  category: { ref: CategoryRef | null; newName: string | null };
  serial: string | null;
  status: Status;
  holder: string | null;
  holderText: string | null;
  place: string | null;
  since: string | null;
  purchasedOn: string | null;
  priceCents: number | null;
  supplier: string | null;
  warrantyUntil: string | null;
  notes: string | null;
  seats: number | null;
  renewsOn: string | null;
  costCents: number | null;
  period: "month" | "year" | null;
  quantity: number | null;
  minQuantity: number | null;
  // Values of the category's fields: by field id when the field exists,
  // by column name when it is to be made.
  extra: Record<string, string>;
  extraNew: Record<string, string>;
  problems: RowProblem[];
};
// A field to make: its name (the column's), the category it goes to (an
// existing one by id, or one the import makes, by name) and its type, read
// from the values.
export type NewField = { name: string; categoryId: string | null; categoryName: string | null; type: FieldType };
export type Plan = {
  source: Source; rows: PlanRow[]; columns: Field[]; ignored: string[]; newCategories: string[];
  // Other columns: those that may be kept as fields (all are, unless the
  // manager said otherwise), and the fields they make.
  offered: string[]; newFields: NewField[];
};
export type Context = { people: Colleague[]; tags: Set<string>; serials: Set<string>; categories: CategoryRef[]; fields: CategoryField[] };
export type Options = { keep?: string[] };

export function plan(text: unknown, source: Source, context: Context, options: Options = {}): Plan {
  if (typeof text !== "string" || text.length > limits.importBytes) throw new AppError("import_invalid");
  // A cell a spreadsheet would run as a formula was written behind a quote
  // (this tool's export, lib/csv.ts, and spreadsheets' own habit): the
  // value is what follows the quote.
  const table = parseCsv(text, limits.importRows + 1).map(row => row.map(c => (/^'[=+\-@\t\r]/u.test(c) ? c.slice(1) : c)));
  if (table.length < 2 || table.length > limits.importRows + 1) throw new AppError("import_invalid");
  const { found, ignored: skippedColumns, custom } = readHeader(table[0]!, source);
  // Other columns: one named as an existing field is always read; the rest
  // when kept (all by default).
  const keepAll = options.keep === undefined;
  const keep = new Set((options.keep ?? []).map(k => fold(k)));
  const matches = (c: { name: string }) => context.fields.some(f => namesOf(f).some(n => fold(n) === fold(c.name)));
  const read = custom.filter(c => matches(c) || keepAll || keep.has(fold(c.name)));
  const ignored = [...skippedColumns, ...custom.filter(c => !read.includes(c)).map(c => c.name)];
  if (found.name === undefined && found.model === undefined && found.tag === undefined) throw new AppError("import_invalid");
  const cell = (row: string[], field: Field) => (found[field] === undefined ? "" : (row[found[field]!] ?? "").trim());
  const body = table.slice(1);
  const dates = (["purchasedOn", "warrantyUntil", "renewsOn", "since"] as Field[]).flatMap(f => body.map(r => cell(r, f)));
  const order = dateOrder(dates, source === "snipe" ? "mdy" : "dmy");
  const people = nameIndex(context.people);
  const matchCategory = categoryMatcher(context.categories);
  const other = context.categories.find(c => c.key === "other") ?? context.categories[0] ?? null;
  const newCategories = new Map<string, string>();
  const room = Math.max(0, limits.categories - context.categories.length);
  const seenTags = new Set<string>();
  const rows: PlanRow[] = [];

  body.forEach((row, i) => {
    if (row.every(c => c.trim() === "")) return;
    const problems: RowProblem[] = [];
    const safe = <T>(read: () => T, code: RowProblem["code"], fallback: T): T => {
      try { return read(); } catch (error) {
        if (!(error instanceof AppError)) throw error;
        problems.push({ code });
        return fallback;
      }
    };
    const clip = (value: string, max: number) => {
      const t = clean(value, 100000, { optional: true, multiline: max === limits.notes });
      return t === "" ? null : [...t].slice(0, max).join("");
    };

    // What it is: the model (with its maker) or the name.
    const model = cell(row, "model"), maker = cell(row, "manufacturer"), assetName = cell(row, "name");
    const modelName = model ? (maker && !fold(model).startsWith(fold(maker)) ? `${maker} ${model}` : model) : "";
    const name = clip(modelName || assetName, limits.name) ?? "";
    let notes = cell(row, "notes");
    if (modelName && assetName && fold(assetName) !== fold(modelName)) notes = [assetName, notes].filter(Boolean).join("\n");

    // Its category: a known one, or a new one named as in the file.
    const categoryText = cell(row, "category");
    let ref = categoryText ? matchCategory(categoryText) : other;
    let newName: string | null = null;
    if (!ref && categoryText) {
      const key = singular(plain(categoryText));
      if (newCategories.has(key) || newCategories.size < room) {
        newName = newCategories.get(key) ?? clip(categoryText, limits.categoryName);
        if (newName) newCategories.set(key, newName);
      }
      if (!newName) ref = other;
    }
    const licence = ref?.kind === "licence";
    const consumable = ref?.kind === "consumable";

    // Its tag: kept when it is free; a row already here is left out.
    const tagText = cell(row, "tag");
    let tag: string | null = null;
    let skip: PlanRow["skip"] = null;
    if (tagText) {
      try {
        tag = readTag(tagText);
        const k = tag.toLowerCase();
        if (context.tags.has(k)) skip = "exists";
        else if (seenTags.has(k)) skip = "duplicate";
        seenTags.add(k);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        problems.push({ code: "bad_tag" });
      }
    }
    const serial = licence || consumable ? null : clip(cell(row, "serial"), limits.serial);
    if (!skip && !tag && serial && context.serials.has(fold(serial))) skip = "exists";
    if (!name) skip ??= "no_name";

    // Who has it.
    const first = cell(row, "holderFirst"), last = cell(row, "holderLast");
    const holderText = (cell(row, "holder") || [first, last].filter(Boolean).join(" ")).replace(/\s*\((former member|ancien membre)\)\s*$/iu, "").replace(/^([^,]+),\s*(.+)$/u, "$2 $1").trim();
    const addressName = (cell(row, "holderEmail").split("@")[0] || cell(row, "holderUser")).replace(/[._-]+/gu, " ");
    let holder: string | null = null;
    // Checked out to a location (Snipe-IT) is a place; to another asset, nobody.
    const target = plain(cell(row, "checkoutType"));
    const toPlace = target === "location" || target === "emplacement" || target === "lieu";
    const toAsset = target === "asset" || target === "materiel";
    if (!licence && !consumable && !toPlace && !toAsset && (holderText || addressName)) {
      const byName = holderText ? people.get(plain(holderText)) ?? [] : [];
      const byAddress = !byName.length && addressName ? people.get(plain(addressName)) ?? [] : [];
      const matches = byName.length ? byName : byAddress;
      if (matches.length === 1) holder = matches[0]!;
      else if (!/^(former member|ancien membre)$/iu.test(holderText)) problems.push({ code: matches.length > 1 ? "holder_ambiguous" : "holder_not_found", name: holderText || addressName });
    }
    const place = licence || consumable || holder ? null : toPlace ? clip(cell(row, "holder") || cell(row, "place"), limits.place) : clip(cell(row, "place"), limits.place);

    // Its state.
    const said = readStatus(cell(row, "status"));
    let status: Status;
    if (licence || consumable) status = said === "retired" ? "retired" : "in_stock";
    else if (said === "lost" || said === "retired" || said === "in_repair") status = said;
    else status = holder || place ? "in_use" : "in_stock";
    const heldBy = status === "in_use" ? holder : null;
    const heldAt = status === "in_use" ? place : null;

    const purchasedOn = safe(() => readDate(cell(row, "purchasedOn"), order), "bad_date", null);
    let warrantyUntil = licence || consumable ? null : safe(() => readDate(cell(row, "warrantyUntil"), order), "bad_date", null);
    const months = cell(row, "warrantyMonths");
    if (!licence && !consumable && !warrantyUntil && /^\d{1,3}$/u.test(months) && Number(months) > 0 && Number(months) <= 240 && purchasedOn) warrantyUntil = addMonths(purchasedOn, Number(months));
    const since = heldBy || heldAt ? safe(() => readDate(cell(row, "since"), order), "bad_date", null) : null;
    const priceCents = safe(() => money(cell(row, "price")), "bad_price", null);
    const costCents = licence ? safe(() => money(cell(row, "cost")), "bad_price", null) ?? priceCents : null;
    const readCount = (t: string) => {
      const n = t.replace(/[\s.,]/gu, "");
      if (!/^\d{1,7}$/u.test(n) || Number(n) > limits.quantity) throw new AppError("invalid_quantity");
      return Number(n);
    };
    const quantity = consumable ? safe(() => (cell(row, "quantity") ? readCount(cell(row, "quantity")) : 0), "bad_quantity", 0) : null;
    const minQuantity = consumable ? safe(() => (cell(row, "minQuantity") ? readCount(cell(row, "minQuantity")) : null), "bad_quantity", null) : null;

    // Other columns: into the category's field of that name, or one to make.
    const extra: Record<string, string> = {};
    const extraNew: Record<string, string> = {};
    const own = ref && !newName ? context.fields.filter(f => f.categoryId === ref.id) : [];
    for (const c of read) {
      const value = (row[c.index] ?? "").trim();
      if (!value) continue;
      const field = own.find(f => namesOf(f).some(n => fold(n) === fold(c.name)));
      if (field) {
        const v = safe(() => fieldValue(field.type, value), "bad_field", null);
        if (v !== null) extra[field.id] = v;
      } else extraNew[c.name] = [...value].slice(0, limits.fieldValue).join("");
    }

    const seats = licence ? safe(() => {
      const t = cell(row, "seats");
      if (!t) return 1;
      if (!/^\d{1,6}$/u.test(t) || Number(t) < 1) throw new AppError("invalid_seats");
      return Number(t);
    }, "bad_seats", 1) : null;

    rows.push({
      line: i + 2, skip, tag: problems.some(p => p.code === "bad_tag") ? null : tag, name, category: { ref: newName ? null : ref, newName },
      serial, status, holder: heldBy, holderText: holderText || addressName || null, place: heldAt, since,
      purchasedOn: licence ? null : purchasedOn, priceCents: licence ? null : priceCents, supplier: clip(cell(row, "supplier"), limits.supplier),
      warrantyUntil, notes: clip(notes, limits.notes), seats,
      renewsOn: licence ? safe(() => readDate(cell(row, "renewsOn"), order), "bad_date", null) : null,
      costCents,
      period: licence ? readPeriod(cell(row, "period")) ?? "year" : null,
      quantity, minQuantity, extra, extraNew,
      problems: problems.filter((p, k) => problems.findIndex(q => q.code === p.code) === k),
    });
  });
  if (rows.length === 0) throw new AppError("import_invalid");

  // The fields to make: per category and column, typed by what the values
  // read as (all numbers, all dates, or text), then the values written so.
  const made = new Map<string, NewField & { values: { row: PlanRow; value: string }[] }>();
  for (const r of rows) {
    if (r.skip) continue;
    const place = r.category.newName ? { categoryId: null, categoryName: r.category.newName } : { categoryId: r.category.ref?.id ?? null, categoryName: null };
    if (!place.categoryId && !place.categoryName) continue;
    for (const [name, value] of Object.entries(r.extraNew)) {
      const key = `${place.categoryId ?? "new:" + place.categoryName}|${fold(name)}`;
      const entry = made.get(key) ?? { name, ...place, type: "text" as FieldType, values: [] };
      entry.values.push({ row: r, value });
      made.set(key, entry);
    }
  }
  const newFields: NewField[] = [];
  const perCategory = new Map<string, number>();
  for (const entry of made.values()) {
    const cat = entry.categoryId ?? "new:" + entry.categoryName;
    const room = limits.fieldsPerCategory - context.fields.filter(f => f.categoryId === entry.categoryId).length - (perCategory.get(cat) ?? 0);
    if (room <= 0) {
      for (const { row } of entry.values) delete row.extraNew[entry.name];
      continue;
    }
    perCategory.set(cat, (perCategory.get(cat) ?? 0) + 1);
    const numbers = entry.values.every(v => { try { fieldValue("number", v.value); return true; } catch { return false; } });
    const dates = !numbers && entry.values.every(v => { try { return readDate(v.value, order) !== null; } catch { return false; } });
    entry.type = numbers ? "number" : dates ? "date" : "text";
    for (const { row, value } of entry.values) row.extraNew[entry.name] = entry.type === "number" ? fieldValue("number", value)! : entry.type === "date" ? readDate(value, order)! : value;
    newFields.push({ name: entry.name, categoryId: entry.categoryId, categoryName: entry.categoryName, type: entry.type });
  }
  return {
    source, rows, columns: Object.keys(found) as Field[], ignored, newCategories: [...newCategories.values()],
    offered: custom.filter(c => !matches(c)).map(c => c.name), newFields,
  };
}

// ---- Reading the context, applying ------------------------------------------

async function context(sql: Query): Promise<Context> {
  const listed = await everyone();
  if (!listed.ok) throw new AppError("unavailable");
  const items = await sql<{ tag: string; serial: string | null }[]>`select tag, serial from items where deleted_at is null`;
  const categories = await sql<{ id: string; key: CategoryKey | null; name: string | null; kind: Kind }[]>`
    select id, key, name, kind from categories where removed_at is null order by position, id`;
  return {
    people: listed.people,
    tags: new Set(items.map(i => i.tag.toLowerCase())),
    serials: new Set(items.flatMap(i => (i.serial ? [fold(i.serial)] : []))),
    categories: categories.map(c => ({ id: String(c.id), key: c.key, name: c.name, kind: c.kind })),
    fields: await allFields(sql),
  };
}

// The columns to keep as fields, as the page sends them (all when absent).
function readOptions(value: unknown): Options {
  if (value === undefined || value === null) return {};
  const keep = (value as { keep?: unknown }).keep;
  if (keep === undefined) return {};
  if (!Array.isArray(keep) || keep.length > 200 || !keep.every(k => typeof k === "string" && k.length <= 200)) throw new AppError("invalid");
  return { keep: keep as string[] };
}

export async function previewImport(sql: Sql, actor: Member | null, source: unknown, text: unknown, options?: unknown): Promise<Plan> {
  if (!actor || !can(actor, "items.manage")) throw new AppError("forbidden");
  if (!isSource(source)) throw new AppError("invalid");
  return plan(text, source, await context(sql), readOptions(options));
}

export async function applyImport(sql: Sql, actor: Member | null, source: unknown, text: unknown, options?: unknown): Promise<{ imported: number; skipped: number; fields: number }> {
  if (!actor || !can(actor, "items.manage")) throw new AppError("forbidden");
  if (!isSource(source)) throw new AppError("invalid");
  const wanted = readOptions(options);
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('equipment.tags'))`;
    await tx`select pg_advisory_xact_lock(hashtext('equipment.fields'))`;
    const p = plan(text, source, await context(tx), wanted);
    const usable = p.rows.filter(r => !r.skip);
    const [count] = await tx<{ n: number }[]>`select count(*)::int as n from items where deleted_at is null`;
    if (count!.n + usable.length > limits.items) throw new AppError("too_many", { max: limits.items });
    const created = new Map<string, string>();
    for (const name of p.newCategories) {
      const [row] = await tx<{ id: string }[]>`
        insert into categories (name, icon, kind, position) values (${name}, 'box', 'asset', (select coalesce(max(position), 0) + 1 from categories)) returning id`;
      created.set(name, String(row!.id));
    }
    // The fields to make, then each row's values by field id.
    const fieldIds = new Map<string, string>();
    for (const f of p.newFields) {
      const categoryId = f.categoryId ?? created.get(f.categoryName!)!;
      const [row] = await tx<{ id: string }[]>`
        insert into fields (category_id, name, type, position)
        values (${categoryId}, ${f.name}, ${f.type}, (select coalesce(max(position), 0) + 1 from fields where category_id = ${categoryId}))
        returning id`;
      fieldIds.set(`${categoryId}|${fold(f.name)}`, String(row!.id));
    }
    const [top] = await tx<{ n: number }[]>`select coalesce(max(substring(tag from 4)::int), 0)::int as n from items where tag ~ '^EQ-[0-9]{1,9}$'`;
    let next = top!.n;
    // Tags the file names, so that the tool's own numbers skip them.
    const named = new Set(usable.flatMap(r => (r.tag ? [r.tag.toLowerCase()] : [])));
    const today = chest.today();
    const note = source === "snipe" ? "Snipe-IT" : source === "intune" ? "Intune" : "CSV";
    for (const r of usable) {
      let tag = r.tag;
      while (!tag) {
        const candidate = makeTag(++next);
        if (!named.has(candidate.toLowerCase())) tag = candidate;
      }
      const categoryId = r.category.newName ? created.get(r.category.newName)! : r.category.ref!.id;
      const held = r.holder !== null || r.place !== null;
      const since = held ? (r.since && r.since <= today ? r.since : today) : null;
      const extra = { ...r.extra };
      for (const [name, value] of Object.entries(r.extraNew)) {
        const fieldId = fieldIds.get(`${categoryId}|${fold(name)}`);
        if (fieldId) extra[fieldId] = value;
      }
      const [row] = await tx<{ id: string }[]>`
        insert into items (category_id, tag, name, serial, status, purchased_on, price_cents, supplier, warranty_until, notes, seats, renews_on, cost_cents, period,
          holder, place, held_since, quantity, min_quantity, extra, created_by)
        values (${categoryId}, ${tag}, ${r.name}, ${r.serial}, ${r.status}, ${r.purchasedOn}, ${r.priceCents}, ${r.supplier}, ${r.warrantyUntil}, ${r.notes},
          ${r.seats}, ${r.renewsOn}, ${r.costCents}, ${r.period}, ${r.holder}, ${r.place}, ${since}, ${r.quantity}, ${r.minQuantity}, ${tx.json(extra)}, ${actor.id})
        returning id`;
      await tx`insert into history (item_id, actor, kind, status, note) values (${row!.id}, ${actor.id}, 'imported', ${r.status}, ${note})`;
      if (held) await tx`insert into history (item_id, actor, kind, member, place, day) values (${row!.id}, ${actor.id}, 'given', ${r.holder}, ${r.place}, ${since})`;
    }
    return { imported: usable.length, skipped: p.rows.length - usable.length, fields: p.newFields.length };
  });
}

