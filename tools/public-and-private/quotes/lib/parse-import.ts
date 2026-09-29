// Safe in the browser: no SDK here.
// Reading a spreadsheet of clients or of catalogue items — as Axonaut,
// Sellsy, Pennylane, Henrri, Excel or anyone exports it — into rows of the
// fields this tool knows. Pure: the page shows the columns matched and the
// first rows before anything is sent; the server reads the file again with
// the mapping chosen and checks every value (lib/importers.ts).
import { AppError } from "./app-error.ts";
import { parseCsv } from "./csv.ts";
import { fold, key } from "./fold.ts";
import { parseAmount, vatRates } from "./money.ts";

export const importLimits = { rows: 5000, bytes: 2 * 1024 * 1024 } as const;

export const importKinds = ["clients", "items"] as const;
export type ImportKind = (typeof importKinds)[number];
export const isImportKind = (value: unknown): value is ImportKind => typeof value === "string" && (importKinds as readonly string[]).includes(value);

export const fieldsOf = {
  clients: ["name", "kind", "firstName", "lastName", "contact", "email", "phone", "address", "address2", "postcode", "city", "country", "siren", "siret", "vatNumber", "deliveryAddress", "language", "account", "notes"],
  items: ["name", "description", "unit", "unitPrice", "priceInclVat", "vatRate", "kind"],
} as const;
export type Field = (typeof fieldsOf)[ImportKind][number];

// The headers of the usual exports and templates, folded (lib/fold.ts
// key). The French invoicing tools write French headers ("Raison sociale",
// "Dénomination", "N° TVA intracommunautaire", "Prix unitaire HT", "Taux de
// TVA"…); English ones come from English exports and hand-made sheets.
// Where a header is not known the person matches it on the page.
const headers: Record<ImportKind, Record<string, Field>> = {
  clients: dictionary({
    name: ["name", "nom", "raisonsociale", "denomination", "denominationsociale", "societe", "nomdelasociete", "entreprise", "nomdelentreprise", "company", "companyname",
      "client", "nomduclient", "clientname", "customer", "customername", "organisation", "organization", "tiers", "nomdutiers", "nomcomplet", "fullname"],
    kind: ["companyorindividual", "entrepriseouparticulier", "type", "typedeclient", "typeclient", "typedetiers", "kind", "nature", "formedeclient", "particulierouprofessionnel", "customertype"],
    firstName: ["prenom", "firstname", "prenomducontact", "contactprenom", "givenname"],
    lastName: ["nomdefamille", "lastname", "surname", "contactnom", "familyname"],
    contact: ["contact", "personneacontacter", "contactname", "nomducontact", "interlocuteur", "contactprincipal", "personnecontact", "contactperson", "attention"],
    email: ["email", "mail", "courriel", "adresseemail", "adressemail", "emailcontact", "emaildefacturation", "emailfacturation", "emailducontact", "emailaddress", "billingemail"],
    phone: ["telephone", "tel", "phone", "telephonefixe", "mobile", "portable", "phonenumber", "numerodetelephone", "telephoneducontact"],
    address: ["adresse", "address", "adressedefacturation", "rue", "adresse1", "adresseligne1", "ligne1", "billingaddress", "street", "streetaddress", "addressline1",
      "adressefacturation", "adressedefacturationrue", "voie", "numeroetrue"],
    address2: ["adresse2", "adresseligne2", "ligne2", "complementdadresse", "complementadresse", "complement", "address2", "addressline2"],
    postcode: ["codepostal", "cp", "postcode", "zip", "zipcode", "postalcode", "codepostaldefacturation", "codepostalfacturation"],
    city: ["ville", "city", "commune", "localite", "villedefacturation", "villefacturation", "town"],
    country: ["pays", "country", "codepays", "countrycode", "paysdefacturation", "paysfacturation"],
    siren: ["siren", "numerosiren", "nsiren", "sirenduclient"],
    siret: ["siret", "numerosiret", "nsiret"],
    vatNumber: ["tva", "numerodetva", "numerotva", "ntva", "notva", "ndetva", "tvaintracommunautaire", "numerodetvaintracommunautaire", "ntvaintracommunautaire", "ntvaintra",
      "numerotvaintracommunautaire", "tvaintra", "identifianttva", "vatnumber", "vat", "vatid", "vatno", "taxid", "intracommunitynumber", "numeroidentificationtva"],
    deliveryAddress: ["adressedelivraison", "adresselivraison", "deliveryaddress", "shippingaddress", "livraison"],
    language: ["langue", "language", "lang", "languedesdocuments", "languageofdocuments"],
    account: ["codeinyourbooks", "codecomptable", "codeclient", "comptecomptable", "compteauxiliaire", "compteclient", "numerodecompte", "clientcode", "accountcode", "customernumber", "numeroclient", "codetiers", "compte"],
    notes: ["notes", "note", "commentaire", "commentaires", "remarques", "remarque", "observations", "comments"],
  }),
  items: dictionary({
    name: ["nom", "name", "libelle", "designation", "produit", "article", "intitule", "label", "productname", "nomduproduit", "titre", "title", "service", "prestation", "nomdelarticle"],
    description: ["description", "descriptif", "detail", "details", "descriptionlongue", "longdescription"],
    unit: ["unite", "unit", "unitedemesure", "uom", "unitedevente", "unitofmeasure"],
    unitPrice: ["prixht", "prixunitaireht", "puht", "prixdeventeht", "tarifht", "montantht", "prixunitairehorstaxe", "prixhorstaxe", "unitprice", "priceexclvat", "priceexcludingtax",
      "netprice", "price", "prix", "prixunitaire", "tarif", "prixdevente"],
    priceInclVat: ["prixttc", "prixunitairettc", "puttc", "tarifttc", "prixdeventettc", "montantttc", "priceinclvat", "pricewithtax", "priceincludingtax", "grossprice"],
    vatRate: ["tva", "tauxtva", "tauxdetva", "tvaapplicable", "vat", "vatrate", "taxrate", "taxe", "tauxdetaxe", "tax", "codetva"],
    kind: ["goodsorservice", "bienouservice", "type", "typedeproduit", "typedarticle", "nature", "categorie", "kind", "producttype", "biensouservices", "productorservice"],
  }),
};

function dictionary(entries: Partial<Record<Field, string[]>>): Record<string, Field> {
  const out: Record<string, Field> = {};
  for (const [field, list] of Object.entries(entries) as [Field, string[]][]) for (const k of list) out[k] ??= field;
  return out;
}

export function guessField(kind: ImportKind, header: string): Field | "" {
  return headers[kind][key(header)] ?? "";
}

// A column mapping: for each column of the file, the field it fills ("" =
// left aside). Each field is filled by one column at most: the first.
export type Mapping = (Field | "")[];
export function guessMapping(kind: ImportKind, head: string[]): Mapping {
  const used = new Set<Field>();
  return head.map(h => {
    const field = guessField(kind, h);
    if (!field || used.has(field)) return "";
    used.add(field);
    return field;
  });
}

export type Table = { head: string[]; rows: string[][] };

// readTable: the first line names the columns; empty lines go.
export function readTable(text: string): Table {
  if (typeof text !== "string") throw new AppError("import_invalid");
  if (text.length > importLimits.bytes) throw new AppError("import_too_large");
  const all = parseCsv(text, importLimits.rows + 1);
  if (all.length === 0 || all[0]!.length < 1) throw new AppError("import_invalid");
  if (all.length < 2) throw new AppError("import_empty");
  const [head, ...rows] = all;
  if (rows.length > importLimits.rows) throw new AppError("import_too_large");
  return { head: head!.map(h => h.trim()), rows };
}

export function checkMapping(kind: ImportKind, head: string[], mapping: unknown): Mapping {
  if (!Array.isArray(mapping) || mapping.length !== head.length) throw new AppError("import_invalid");
  const allowed = new Set<string>(fieldsOf[kind]);
  const used = new Set<string>();
  return mapping.map(m => {
    if (m === "" || m === null) return "";
    if (typeof m !== "string" || !allowed.has(m) || used.has(m)) throw new AppError("import_invalid");
    used.add(m);
    return m as Field;
  });
}

// Whether a mapping names what a row needs: a name (or, for a client, a
// first or last name).
export function mappingReady(kind: ImportKind, mapping: Mapping): boolean {
  return kind === "clients" ? mapping.some(f => f === "name" || f === "firstName" || f === "lastName") : mapping.includes("name");
}

// A row as the fields it fills, each trimmed.
export type Mapped = Partial<Record<Field, string>>;
export function mapRow(row: string[], mapping: Mapping): Mapped {
  const out: Mapped = {};
  mapping.forEach((field, i) => {
    const value = (row[i] ?? "").trim();
    if (field && value !== "") out[field] = value;
  });
  return out;
}

// --- Values as other tools write them ----------------------------------------

// A client's kind: a company unless the sheet says a person.
export function clientKindOf(value: string | undefined): "company" | "person" | null {
  const k = key(value ?? "");
  if (!k) return null;
  if (/^(particulier|personnephysique|individu|individual|person|personne|prive|private|b2c|consumer|consommateur)/u.test(k)) return "person";
  if (/^(entreprise|societe|professionnel|pro|company|business|b2b|personnemorale|association|administration|collectivite|organisation|organization)/u.test(k)) return "company";
  return null;
}

// An item's kind: goods or a service ("Produit", "Marchandise", "Service",
// "Prestation de services"…).
export function goodsOf(value: string | undefined): boolean | null {
  const k = key(value ?? "");
  if (!k) return null;
  if (/^(produit|product|marchandise|bien|biens|goods|article|materiel|fourniture|livraisondebiens)/u.test(k)) return true;
  if (/^(service|services|prestation|prestationdeservice|prestationdeservices|main|maindoeuvre|labour|labor|abonnement|subscription)/u.test(k)) return false;
  return null;
}

// A VAT rate as the sheets write it — "20", "20 %", "20,00", "0.2",
// "5,5%", Pennylane's codes "FR_200", "FR_55", "exonéré" — in hundredths
// of a percent, when it is one of the French rates; null otherwise.
export function vatRateOf(value: string | undefined): number | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  const code = /^FR_(\d{1,4})$/iu.exec(text);
  if (code) {
    const n = Number(code[1]) * 10;
    return (vatRates as readonly number[]).includes(n) ? n : null;
  }
  const k = key(text);
  if (/^(exonere|exoneree|exempt|exempte|horschamp|autoliquidation|reversecharge|nonapplicable|0)$/u.test(k)) return 0;
  const m = /^(\d{1,2})(?:[.,](\d{1,3}))?\s*%?$/u.exec(text.replace(/\s/gu, ""));
  if (!m) return null;
  const whole = Number(m[1]);
  const fraction = (m[2] ?? "").padEnd(3, "0").slice(0, 3);
  // "0.2" or "0,055": a fraction of one.
  const bp = whole === 0 && m[2] ? Math.round(Number("0." + m[2]) * 10000) : whole * 100 + Math.round(Number(fraction) / 10);
  return (vatRates as readonly number[]).includes(bp) ? bp : null;
}

// A price typed in a sheet ("1 234,50 €", "1234.5"), in cents; null when
// it is not one.
export function priceOf(value: string | undefined, currency: string): number | null {
  if (!value) return null;
  return parseAmount(value.replace(/[€$£]|EUR|HT|TTC/giu, "").trim(), currency, { negative: true });
}

// A language the documents can be written in, from "fr", "Français",
// "English", "anglais"…
export function languageOf(value: string | undefined): "en" | "fr" | null {
  const k = key(value ?? "");
  if (/^(fr|fra|french|francais|francaise)$/u.test(k)) return "fr";
  if (/^(en|eng|english|anglais|anglaise)$/u.test(k)) return "en";
  return null;
}

// A country as ISO 3166-1 alpha-2, from a code ("FR", "fr") or its name in
// English or French ("France", "Belgique", "Germany").
let names: Map<string, string> | null = null;
// Codes of countries that no longer are, or are not countries, which
// share a name with a current one ("Germany": DE, not DD).
const retired = new Set(["AN", "BU", "CS", "DD", "EU", "EZ", "FX", "NT", "QO", "SU", "TP", "UN", "YD", "YU", "ZR", "ZZ"]);
export function countryOf(value: string | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  if (/^[A-Za-z]{2}$/u.test(text)) return text.toUpperCase();
  if (!names) {
    names = new Map();
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const locale of ["en", "fr"]) {
      let display: Intl.DisplayNames;
      try {
        display = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
      } catch {
        continue;
      }
      for (const a of letters) for (const b of letters) {
        if (retired.has(a + b)) continue;
        const name = display.of(a + b);
        if (name && !names.has(fold(name))) names.set(fold(name), a + b);
      }
    }
  }
  return names.get(fold(text)) ?? null;
}
