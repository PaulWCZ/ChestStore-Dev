// Safe in the browser: no SDK here.
// Reading another tool's export of candidates (Teamtailor, Workable,
// Welcome to the Jungle, a spreadsheet): which column is which. Their
// columns are chosen by whoever exported (Teamtailor lets one pick them),
// so the tool guesses from the headers, in English and French, and the
// recruiter corrects the guess before anything is imported.
import { fold } from "./model.ts";

export const importFields = ["name", "firstName", "lastName", "email", "phone", "link", "stage", "appliedAt", "coverLetter"] as const;
export type ImportField = (typeof importFields)[number];
export type Mapping = Partial<Record<ImportField, number>>;

const clues: Record<ImportField, string[]> = {
  name: ["name", "full name", "candidate", "candidate name", "nom complet", "candidat", "nom et prenom", "prenom nom"],
  firstName: ["first name", "firstname", "given name", "prenom"],
  lastName: ["last name", "lastname", "surname", "family name", "nom", "nom de famille"],
  email: ["email", "e-mail", "email address", "mail", "adresse email", "adresse e-mail", "courriel"],
  phone: ["phone", "phone number", "mobile", "telephone", "tel", "numero de telephone", "portable"],
  link: ["linkedin", "linkedin url", "linkedin profile", "profile url", "portfolio", "website", "url", "site web", "profil linkedin"],
  stage: ["stage", "step", "status", "pipeline stage", "etape", "statut", "etape du processus"],
  appliedAt: ["created at", "applied at", "applied", "application date", "date applied", "created", "date", "date de candidature", "cree le", "postule le"],
  coverLetter: ["cover letter", "message", "motivation", "lettre de motivation", "pitch", "summary"],
};

const norm = (text: string) => fold(text).replace(/[_\-.]+/gu, " ").replace(/\s+/gu, " ").trim();

// guess maps each field to the column whose header says it best: the
// same words first, then a header that starts with them.
export function guess(headers: string[]): Mapping {
  const heads = headers.map(norm);
  const taken = new Set<number>();
  const out: Mapping = {};
  for (const exact of [true, false]) {
    for (const field of importFields) {
      if (out[field] !== undefined) continue;
      const i = heads.findIndex((h, k) => !taken.has(k) && clues[field].some(c => (exact ? h === c : h.startsWith(c + " ") || h.endsWith(" " + c))));
      if (i >= 0) {
        out[field] = i;
        taken.add(i);
      }
    }
  }
  // A full name wins over first and last names only when there is no pair.
  if (out.name !== undefined && out.firstName !== undefined && out.lastName !== undefined) delete out.name;
  return out;
}

export type ImportRow = { line: number; name: string; email: string; phone: string; link: string; stage: string; appliedAt: string; coverLetter: string };

// rowsOf reads the data rows with a mapping (the header row skipped,
// empty rows dropped).
export function rowsOf(table: string[][], mapping: Mapping): ImportRow[] {
  const cell = (row: string[], field: ImportField) => (mapping[field] === undefined ? "" : (row[mapping[field]!] ?? "").trim());
  return table.slice(1).map((row, i) => {
    const name = cell(row, "name") || [cell(row, "firstName"), cell(row, "lastName")].filter(Boolean).join(" ");
    return { line: i + 2, name, email: cell(row, "email"), phone: cell(row, "phone"), link: cell(row, "link"), stage: cell(row, "stage"), appliedAt: cell(row, "appliedAt"), coverLetter: cell(row, "coverLetter") };
  }).filter(r => r.name || r.email);
}

// dateOf reads a date as exports write it: ISO ("2026-05-14",
// "2026-05-14T09:12:00Z", "2026-05-14 09:12"), or day first
// ("14/05/2026", "14.05.2026"). Null when unreadable.
export function dateOf(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(t);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/u.exec(t);
  if (m) return valid(+m[3]!, +m[2]!, +m[1]!);
  return null;
}
function valid(y: number, mo: number, d: number): string | null {
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || y < 2000) return null;
  return date.toISOString().slice(0, 10);
}

// A CV in an export's ZIP belongs to the candidate whose address its file
// name holds ("lucie.garnier@example.com.pdf", "cv_lucie.garnier@example.com.pdf").
export function emailInName(fileName: string): string | null {
  // "_" and spaces separate words of a file name ("cv_lucie@…"): an
  // address rarely holds them.
  const m = /[A-Za-z0-9.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.exec(fileName.replace(/\.(pdf|docx?|jpe?g|png|heic)$/iu, ""));
  return m ? m[0].toLowerCase() : null;
}
