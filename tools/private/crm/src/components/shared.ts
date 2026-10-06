// Safe in the browser: the shapes and small helpers the views share.
import type { Catalogue } from "../i18n/index.ts";

export type People = Record<string, { name: string; photo: string | null }>;
export type Teammate = { id: string; name: string; photo: string | null };
export type Choice = { id: string; name: string };
export type ContactChoice = { id: string; name: string; companyId: string | null };
// The sections of the catalogue a view reads (an island's props carry
// only those: src/i18n/index.ts pick()).
export type Words<K extends keyof Catalogue> = Pick<Catalogue, K>;
