import { AppError } from "./app-error.ts";
import { parseCsv } from "./csv.ts";
import { key } from "./fold.ts";
import { limits } from "./model.ts";

// Safe in the browser: no SDK here.
// Reading a spreadsheet of companies, contacts or deals — as HubSpot,
// Pipedrive, a French Excel or anyone writes it — into rows of known
// fields. Pure: the page shows the mapping and a preview before anything is
// sent; the server reads the file again with the mapping chosen and checks
// every value (lib/importers.ts).

export const importKinds = ["contacts", "companies", "deals"] as const;
export type ImportKind = (typeof importKinds)[number];
export const isImportKind = (value: unknown): value is ImportKind => typeof value === "string" && (importKinds as readonly string[]).includes(value);

export const fieldsOf = {
  companies: ["name", "website", "phone", "address", "city", "postcode", "country", "industry", "tags", "notes", "owner"],
  contacts: ["name", "firstName", "lastName", "email", "phone", "title", "company", "tags", "notes", "owner"],
  deals: ["title", "company", "contact", "contactEmail", "value", "stage", "status", "closeDate", "owner", "reason"],
} as const;
export type Field = (typeof fieldsOf)[ImportKind][number];

// Headers of the usual exports, folded (lib/fold.ts key): HubSpot ("First
// Name", "Company Domain Name", "Deal Stage", "Contact owner"…), Pipedrive
// ("Person - Email - Work", "Deal - Expected close date"…, after its
// "Person - " / "Deal - " / "Organization - " prefix), French spreadsheets.
const headers: Record<ImportKind, Record<string, Field>> = {
  companies: dictionary({
    name: ["name", "companyname", "company", "organization", "organisation", "organizationname", "nom", "entreprise", "nomdelentreprise", "societe", "raisonsociale", "account", "accountname"],
    website: ["website", "websiteurl", "companydomainname", "domainname", "domain", "url", "siteweb", "siteinternet", "web"],
    phone: ["phone", "phonenumber", "telephone", "tel", "numerodetelephone", "standard"],
    address: ["address", "streetaddress", "adresse", "address1", "rue", "fulladdress", "adressecomplete"],
    city: ["city", "ville", "commune"],
    postcode: ["postalcode", "zip", "zipcode", "postcode", "codepostal", "cp"],
    country: ["country", "countryregion", "pays"],
    industry: ["industry", "secteur", "secteurdactivite", "activite", "sector"],
    tags: ["tags", "labels", "label", "etiquettes", "etiquette", "categories", "category"],
    notes: ["notes", "note", "description", "commentaire", "commentaires", "aboutus"],
    owner: ["owner", "companyowner", "organizationowner", "organisationowner", "proprietaire", "responsable", "commercial"],
  }),
  contacts: dictionary({
    name: ["name", "fullname", "nom", "nomcomplet", "contact", "contactname", "person", "personname"],
    firstName: ["firstname", "prenom", "givenname"],
    lastName: ["lastname", "surname", "familyname", "nomdefamille"],
    email: ["email", "emailaddress", "mail", "courriel", "adresseemail", "emailwork", "emailhome", "emailother", "adressemail", "emailtravail"],
    phone: ["phone", "phonenumber", "mobile", "mobilephone", "mobilephonenumber", "telephone", "tel", "portable", "phonework", "phonemobile", "phonehome", "phoneother", "telephonetravail", "telephoneportable"],
    title: ["title", "jobtitle", "role", "position", "fonction", "poste", "intitule", "intituledeposte"],
    company: ["company", "companyname", "associatedcompany", "organization", "organisation", "organizationname", "organisationnom", "entreprise", "societe", "nomdelentreprise", "account", "accountname"],
    tags: ["tags", "labels", "label", "etiquettes", "etiquette", "categories"],
    notes: ["notes", "note", "description", "commentaire", "commentaires"],
    owner: ["owner", "contactowner", "personowner", "proprietaire", "responsable", "commercial"],
  }),
  deals: dictionary({
    title: ["title", "dealname", "name", "deal", "titre", "nom", "nomdelaffaire", "affaire", "opportunite", "opportunityname"],
    company: ["company", "companyname", "associatedcompany", "organization", "organisation", "organizationname", "organisationnom", "entreprise", "societe", "account", "accountname"],
    contact: ["contact", "contactperson", "associatedcontact", "person", "personname", "personnenom", "personnecontact", "contactname", "interlocuteur"],
    contactEmail: ["contactemail", "personemail", "emailducontact", "email"],
    value: ["value", "amount", "montant", "valeur", "dealvalue", "montantht", "amountincompanycurrency"],
    stage: ["stage", "dealstage", "etape", "etapedelaffaire", "phase", "pipelinestage", "statutdelaffaire"],
    status: ["status", "statut", "etat"],
    closeDate: ["closedate", "expectedclosedate", "datedecloture", "datedeclotureprevue", "closingdate", "datedesignatureprevue", "echeance"],
    owner: ["owner", "dealowner", "proprietaire", "responsable", "commercial", "proprietairedelaffaire"],
    reason: ["lostreason", "closedlostreason", "closedwonreason", "reason", "raison", "motif", "raisondeperte", "motifdeperte"],
  }),
};

function dictionary(entries: Partial<Record<Field, string[]>>): Record<string, Field> {
  const out: Record<string, Field> = {};
  for (const [field, list] of Object.entries(entries) as [Field, string[]][]) for (const k of list) out[k] ??= field;
  return out;
}

// The prefix Pipedrive puts before its own fields ("Person - Name").
const ownPrefixes: Record<ImportKind, string[]> = {
  companies: ["organization", "organisation"],
  contacts: ["person", "personne"],
  deals: ["deal", "affaire"],
};

export function guessField(kind: ImportKind, header: string): Field | "" {
  const k = key(header);
  const direct = headers[kind][k];
  if (direct) return direct;
  for (const prefix of ownPrefixes[kind]) {
    if (k.startsWith(prefix) && k.length > prefix.length) {
      const rest = headers[kind][k.slice(prefix.length)];
      if (rest) return rest;
    }
  }
  return "";
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
  if (typeof text !== "string" || text.length > limits.importBytes) throw new AppError("import_invalid");
  const all = parseCsv(text, limits.importRows + 1);
  if (all.length < 2) throw new AppError("import_empty");
  const [head, ...rows] = all;
  if (rows.length > limits.importRows) throw new AppError("too_many", { max: limits.importRows });
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

// Names as exports write them: HubSpot's "Acme (1234567)" association,
// several separated by ";" — the first, without its id.
export function firstName(value: string | undefined): string {
  return (value ?? "").split(";")[0]!.replace(/\s*\(\d+\)\s*$/u, "").trim();
}

// Dates of other tools: ISO (2026-10-01, 2026-10-01 14:03), a French sheet
// (01/10/2026, 01.10.2026). A day, or null.
export function dayOf(value: string | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(text);
  if (m) return valid(`${m[1]}-${m[2]}-${m[3]}`);
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/u.exec(text);
  if (m) return valid(`${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  return null;
}
function valid(day: string): string | null {
  const d = new Date(day + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day ? day : null;
}

// What a status or a stage says of the end: won, lost, or neither.
export function endOf(value: string | undefined): "won" | "lost" | null {
  const k = key(value ?? "");
  if (!k) return null;
  if (/(^|closed)won$|^gagne|^signe|^won/u.test(k)) return "won";
  if (/(^|closed)lost$|^perdu|^lost|^abandon/u.test(k)) return "lost";
  return null;
}
