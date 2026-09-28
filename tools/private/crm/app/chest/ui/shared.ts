// Safe in the browser: the shapes and small helpers the views share.
import type { Catalogue } from "../../../lib/i18n/index.ts";

export type People = Record<string, { name: string; photo: string | null }>;
export type Teammate = { id: string; name: string; photo: string | null };
export type Choice = { id: string; name: string };
export type ContactChoice = { id: string; name: string; companyId: string | null };
export type Fail = (error: keyof Catalogue["errors"], values?: Record<string, string | number>) => void;

// A server action's answer, as the views read it.
export type Answer<T = null> = { ok: true; value: T } | { ok: false; error: keyof Catalogue["errors"]; values?: Record<string, number | string> };
