import type { IncomingMessage } from "node:http";
import type { Sql } from "postgres";
import { openMany, seal } from "../../../packages/chest-client/src/sealed.js";

// The team's secrets — the capability sealed of its manifest —: a label in
// clear, a value the Chest seals (the SDK's sealed.ts) and the tool keeps
// sealed in the table secrets of its database, bound to its label (the
// context), for the editors alone when asked (the role editor). The tool
// opens them again on a member's request only; the Data tab, the agents'
// SQL and the backups read them sealed.
export const maxSecrets = 100;
export const maxLabel = 64;
export const maxValue = 1024;

export type Secret = { id: number; label: string; value: string; editors: boolean };
// A secret as a member reads it: its value, or null when it is not theirs to
// open (an editors' secret and a reader).
export type Shown = { id: number; label: string; value: string | null; editors: boolean };

// Where the secrets are kept: the database, or a test's stand-in. value is
// the sealed text.
export interface SecretStore {
  list(): Promise<Secret[]>;
  // add returns the new secret, or null when the label is taken or the list full.
  add(label: string, value: string, editors: boolean): Promise<Secret | null>;
}

// secretLabel is the label of a secret: 1 to 64 letters, digits, dashes or
// dots; null otherwise.
export function secretLabel(input: unknown): string | null {
  return typeof input === "string" && /^[a-z0-9][a-z0-9.-]{0,63}$/u.test(input) ? input : null;
}

// Secrets seals what a member writes and opens what a member reads, through
// the Chest.
export class Secrets {
  readonly #store: SecretStore;
  constructor(store: SecretStore) { this.#store = store; }
  async add(label: string, value: string, editors: boolean): Promise<Shown | null> {
    const sealed = await seal(value, { context: "secret:" + label, ...(editors ? { roles: ["editor"] } : {}) });
    const secret = await this.#store.add(label, sealed, editors);
    return secret ? { id: secret.id, label, value, editors } : null;
  }
  async list(request: IncomingMessage): Promise<Shown[]> {
    const kept = await this.#store.list();
    const values = await openMany(request, kept.map(s => ({ sealed: s.value, context: "secret:" + s.label })));
    return kept.map((s, i) => ({ id: s.id, label: s.label, value: values[i] ?? null, editors: s.editors }));
  }
}

// PostgresSecrets keeps the sealed values in the table secrets, by
// parameterised queries only.
export class PostgresSecrets implements SecretStore {
  readonly #sql: Sql;
  constructor(sql: Sql) { this.#sql = sql; }
  async list(): Promise<Secret[]> {
    const rows = await this.#sql<Secret[]>`SELECT id, label, value, editors FROM secrets ORDER BY id`;
    return rows.map(({ id, label, value, editors }) => ({ id, label, value, editors }));
  }
  async add(label: string, value: string, editors: boolean): Promise<Secret | null> {
    const rows = await this.#sql<Secret[]>`INSERT INTO secrets (label, value, editors) SELECT ${label}, ${value}, ${editors} WHERE (SELECT count(*) FROM secrets) < ${maxSecrets} ON CONFLICT (label) DO NOTHING RETURNING id, label, value, editors`;
    const secret = rows[0];
    return secret ? { id: secret.id, label: secret.label, value: secret.value, editors: secret.editors } : null;
  }
}
