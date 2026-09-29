import { AppError } from "./app-error.ts";
import { parseCsv } from "./csv.ts";
import { fold, key } from "./fold.ts";
import { limits } from "./model.ts";

// Safe in the browser: no SDK here.
// Reading a spreadsheet of companies, contacts, deals or their history —
// as HubSpot, Pipedrive, a French Excel or anyone writes it — into rows of
// known fields. Pure: the page shows the mapping and a preview before
// anything is sent; the server reads the file again with the mapping chosen
// and checks every value (lib/importers.ts). Nothing of the file is lost
// silently: a column the tool does not know goes into the record's notes
// ("Lifecycle Stage: Customer") unless someone chooses to leave it aside,
// or — a manager — to make it one of the team's own fields.

export const importKinds = ["contacts", "companies", "deals", "activities"] as const;
export type ImportKind = (typeof importKinds)[number];
export const isImportKind = (value: unknown): value is ImportKind => typeof value === "string" && (importKinds as readonly string[]).includes(value);

export const fieldsOf = {
  companies: ["name", "website", "phone", "email", "address", "city", "postcode", "country", "siren", "vat", "industry", "tags", "notes", "owner", "createdAt"],
  contacts: ["name", "firstName", "lastName", "email", "phone", "phone2", "url", "title", "company", "tags", "notes", "owner", "createdAt"],
  deals: ["title", "company", "contact", "contactEmail", "value", "stage", "status", "closeDate", "owner", "reason", "createdAt"],
  activities: ["date", "type", "subject", "text", "done", "deal", "contact", "contactEmail", "company", "owner"],
} as const;
export type Field = (typeof fieldsOf)[ImportKind][number];

// What a column of the file becomes: one of the tool's fields, one of the
// team's own (custom:<id>), a new field made from it ("new", managers),
// lines in the notes ("keep"), or nothing ("").
export type Target = Field | "" | "keep" | "new" | `custom:${string}`;
export type Mapping = Target[];

// Headers of the usual exports, folded (lib/fold.ts key): HubSpot ("First
// Name", "Company Domain Name", "Deal Stage", "Contact owner", "Create
// Date", "Note body", "Activity date"…), Pipedrive ("Person - Email - Work",
// "Deal - Expected close date", "Activity - Subject", "Note - Content"…,
// after its "Person - " / "Deal - " / "Organization - " / "Activity - "
// prefix), French spreadsheets.
const headers: Record<ImportKind, Record<string, Field>> = {
  companies: dictionary({
    name: ["name", "companyname", "company", "organization", "organisation", "organizationname", "nom", "entreprise", "nomdelentreprise", "societe", "raisonsociale", "account", "accountname"],
    website: ["website", "websiteurl", "companydomainname", "domainname", "domain", "url", "siteweb", "siteinternet", "web"],
    phone: ["phone", "phonenumber", "telephone", "tel", "numerodetelephone", "standard"],
    email: ["email", "emailaddress", "companyemail", "mail", "courriel", "adresseemail", "emailfacturation", "billingemail"],
    address: ["address", "streetaddress", "adresse", "address1", "rue", "fulladdress", "adressecomplete", "addressstreetaddress", "addressfull"],
    city: ["city", "ville", "commune", "addresscitytown", "addresscity", "citytown"],
    postcode: ["postalcode", "zip", "zipcode", "postcode", "codepostal", "cp", "addresszippostalcode", "zippostalcode"],
    country: ["country", "countryregion", "pays", "addresscountry"],
    siren: ["siren", "siret", "numerosiren", "numerosiret", "sirensiret", "companyregistrationnumber", "registrationnumber"],
    vat: ["vat", "vatnumber", "vatid", "numerodetva", "tva", "tvaintracommunautaire", "numerotvaintracommunautaire", "numerotva"],
    industry: ["industry", "secteur", "secteurdactivite", "activite", "sector"],
    tags: ["tags", "labels", "label", "etiquettes", "etiquette", "categories", "category"],
    notes: ["notes", "note", "description", "commentaire", "commentaires", "aboutus"],
    owner: ["owner", "companyowner", "organizationowner", "organisationowner", "proprietaire", "responsable", "commercial"],
    createdAt: ["createdate", "createdat", "created", "addtime", "datedecreation", "creele", "datecreation"],
  }),
  contacts: dictionary({
    name: ["name", "fullname", "nom", "nomcomplet", "contact", "contactname", "person", "personname"],
    firstName: ["firstname", "prenom", "givenname"],
    lastName: ["lastname", "surname", "familyname", "nomdefamille"],
    email: ["email", "emailaddress", "mail", "courriel", "adresseemail", "emailwork", "emailhome", "emailother", "adressemail", "emailtravail"],
    phone: ["phone", "phonenumber", "telephone", "tel", "phonework", "telephonetravail", "telephonefixe", "fixe", "phonehome", "phoneother"],
    phone2: ["mobile", "mobilephone", "mobilephonenumber", "portable", "phonemobile", "telephoneportable", "cellphone", "gsm"],
    url: ["url", "linkedin", "linkedinurl", "linkedinprofile", "profillinkedin", "website", "siteweb", "websiteurl"],
    title: ["title", "jobtitle", "role", "position", "fonction", "poste", "intitule", "intituledeposte"],
    company: ["company", "companyname", "associatedcompany", "organization", "organisation", "organizationname", "organisationnom", "entreprise", "societe", "nomdelentreprise", "account", "accountname"],
    tags: ["tags", "labels", "label", "etiquettes", "etiquette", "categories"],
    notes: ["notes", "note", "description", "commentaire", "commentaires"],
    owner: ["owner", "contactowner", "personowner", "proprietaire", "responsable", "commercial"],
    createdAt: ["createdate", "createdat", "created", "addtime", "datedecreation", "creele", "datecreation"],
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
    createdAt: ["createdate", "createdat", "created", "addtime", "dealcreated", "datedecreation", "creele", "datecreation"],
  }),
  activities: dictionary({
    date: ["date", "activitydate", "duedate", "addtime", "createdate", "createdat", "notedate", "dateofactivity", "datedelactivite", "echeance", "dateecheance", "timestamp"],
    type: ["type", "activitytype", "typedactivite", "engagementtype", "kind"],
    subject: ["subject", "calltitle", "meetingname", "emailsubject", "tasktitle", "sujet", "objet", "titre"],
    text: ["note", "notes", "content", "notecontent", "body", "notebody", "callnotes", "meetingdescription", "emailbody", "taskbody", "description", "commentaire", "texte", "contenu"],
    done: ["done", "markedasdone", "taskstatus", "status", "fait", "statut", "termine"],
    deal: ["deal", "dealtitle", "dealname", "associateddeal", "affaire", "titredelaffaire"],
    contact: ["contact", "person", "personname", "associatedcontact", "contactname", "personne", "interlocuteur"],
    contactEmail: ["email", "personemail", "contactemail", "emailducontact", "associatedcontactemail"],
    company: ["company", "organization", "organisation", "organizationname", "organisationnom", "associatedcompany", "companyname", "entreprise", "societe"],
    owner: ["owner", "assignedto", "user", "activityassignedto", "activityowner", "createdby", "proprietaire", "responsable", "utilisateur", "hubspotowner", "assignedtouser"],
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
  activities: ["activity", "activite", "note", "engagement", "call", "meeting", "task"],
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

// guessMapping: for each column of the file, the field it fills. Each field
// is filled by one column at most (the first; a second phone goes to the
// other phone); a column named like one of the team's fields fills it; any
// other column goes to the notes.
export function guessMapping(kind: ImportKind, head: string[], custom: { id: string; label: string }[] = []): Mapping {
  const used = new Set<string>();
  return head.map(h => {
    let field: Target = guessField(kind, h);
    if (field === "phone" && used.has("phone") && kind === "contacts") field = "phone2";
    if (field && !used.has(field)) {
      used.add(field);
      return field;
    }
    if (field) return "keep";
    const mine = kind === "activities" ? undefined : custom.find(c => fold(c.label) === fold(h));
    if (mine && !used.has("custom:" + mine.id)) {
      used.add("custom:" + mine.id);
      return `custom:${mine.id}` as const;
    }
    return h.trim() === "" ? "" : "keep";
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

// checkMapping: the page's mapping, checked against the file and what the
// importer may do (a new field: someone who sets fields).
export function checkMapping(kind: ImportKind, head: string[], mapping: unknown, custom: string[] = [], mayCreate = false): Mapping {
  if (!Array.isArray(mapping) || mapping.length !== head.length) throw new AppError("import_invalid");
  const allowed = new Set<string>(fieldsOf[kind]);
  const used = new Set<string>();
  return mapping.map(m => {
    if (m === "" || m === null) return "";
    if (m === "keep") return "keep";
    if (m === "new") {
      if (!mayCreate || kind === "activities") throw new AppError("forbidden");
      return "new";
    }
    if (typeof m !== "string" || used.has(m)) throw new AppError("import_invalid");
    if (m.startsWith("custom:")) {
      if (kind === "activities" || !custom.includes(m.slice(7))) throw new AppError("import_invalid");
    } else if (!allowed.has(m)) throw new AppError("import_invalid");
    used.add(m);
    return m as Target;
  });
}

// A row as the fields it fills, each trimmed; what goes to the notes and
// to the team's fields, by column.
export type Mapped = Partial<Record<Field, string>> & { kept?: [string, string][]; custom?: [string, string][] };
export function mapRow(row: string[], mapping: Mapping, head: string[] = []): Mapped {
  const out: Mapped = {};
  mapping.forEach((target, i) => {
    const value = (row[i] ?? "").trim();
    if (!target || value === "") return;
    if (target === "keep") (out.kept ??= []).push([head[i] ?? "", value]);
    else if (target === "new") (out.custom ??= []).push([`new:${i}`, value]);
    else if (target.startsWith("custom:")) (out.custom ??= []).push([target.slice(7), value]);
    else out[target as Field] = value;
  });
  return out;
}

// The owners a file names (its owner column), with how many rows each.
export function ownersIn(table: Table, mapping: Mapping): { name: string; rows: number }[] {
  const at = mapping.indexOf("owner");
  if (at < 0) return [];
  const counts = new Map<string, { name: string; rows: number }>();
  for (const row of table.rows) {
    const name = (row[at] ?? "").trim();
    if (!name) continue;
    const k = fold(name);
    const found = counts.get(k) ?? { name, rows: 0 };
    found.rows++;
    counts.set(k, found);
  }
  return [...counts.values()].sort((a, b) => b.rows - a.rows);
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

// The time of day a date carries ("2026-10-01 14:03", "01/10/2026 9:30"),
// or null.
export function timeOf(value: string | undefined): string | null {
  const m = /[ T](\d{1,2}):(\d{2})/u.exec(value ?? "");
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
}

// What a status or a stage says of the end: won, lost, or neither.
export function endOf(value: string | undefined): "won" | "lost" | null {
  const k = key(value ?? "");
  if (!k) return null;
  if (/(^|closed)won$|^gagne|^signe|^won/u.test(k)) return "won";
  if (/(^|closed)lost$|^perdu|^lost|^abandon/u.test(k)) return "lost";
  return null;
}

// What kind of history an activity's type says: a call, a meeting, an
// email, a to-do (a next step, when not done) or a note.
export function activityKind(value: string | undefined): "call" | "meeting" | "email" | "task" | "note" {
  const k = key(value ?? "");
  if (/call|appel|phone|telephone/u.test(k)) return "call";
  if (/meeting|rendezvous|reunion|rdv|lunch|dejeuner|visit|demo/u.test(k)) return "meeting";
  if (/mail|courriel/u.test(k)) return "email";
  if (/task|tache|todo|deadline|afaire|relance|followup/u.test(k)) return "task";
  return "note";
}

// Whether a "done" column says done: yes, 1, true, done, completed, fait…
export function doneOf(value: string | undefined): boolean | null {
  const k = key(value ?? "");
  if (!k) return null;
  if (/^(1|true|yes|oui|done|fait|termine|completed?|marquecommefait)$/u.test(k)) return true;
  if (/^(0|false|no|non|notdone|todo|afaire|open|ouvert|notstarted|inprogress|encours|waiting)$/u.test(k)) return false;
  return null;
}
