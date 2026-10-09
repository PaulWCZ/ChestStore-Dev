// Finding the person of Rooms a file names — an organiser or a guest of
// an .ics export, a desk holder of a sheet — from what the file carries:
// an address, a name, or both. Pure, used by the importers.
//
// - An address is matched first, to the member's address (the addresses
//   of the file the Chest matched: members.matchEmails, lib/directory.ts).
// - A name is matched in the forms real exports write it: "Camille
//   Martin", Outlook's "Martin, Camille" (Exchange's default in many
//   companies), "MARTIN Camille", with or without accents, and with a
//   department after it ("Martin, Camille (Sales)").
// - Failing both, an address's local part read as a name
//   ("camille.martin@…" → "camille martin").
// Two people who answer to the same form match neither: the importer then
// says it did not find the person, rather than guessing.

export type Matchable = { id: string; name: string; firstName?: string; lastName?: string; email?: string };
export type Named = { name: string | null; address: string | null };

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// The forms a name may take in a file, folded: as written, and "Last,
// First" turned round. A department in brackets goes.
function forms(written: string): string[] {
  const bare = written.replace(/\([^)]*\)|\[[^\]]*\]/gu, " ").replace(/^["']|["']$/gu, "").trim();
  const out = [fold(bare)];
  const comma = /^([^,]+),([^,]+)$/u.exec(bare);
  if (comma) out.push(fold(comma[2]! + " " + comma[1]!));
  return out.filter(Boolean);
}

export function matcher(people: readonly Matchable[]): (who: Named | string | null) => string | null {
  const byName = new Map<string, Set<string>>();
  const byAddress = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, id: string) => {
    if (key) map.set(key, (map.get(key) ?? new Set()).add(id));
  };
  for (const p of people) {
    add(byName, fold(p.name), p.id);
    if (p.firstName && p.lastName) {
      add(byName, fold(p.firstName + " " + p.lastName), p.id);
      add(byName, fold(p.lastName + " " + p.firstName), p.id);
    }
    if (p.email) add(byAddress, p.email.trim().toLowerCase(), p.id);
  }
  const one = (found: Set<string> | undefined) => (found && found.size === 1 ? [...found][0]! : null);
  return who => {
    if (!who) return null;
    const { name, address } = typeof who === "string" ? (who.includes("@") ? { name: null, address: who } : { name: who, address: null }) : who;
    const mail = address?.trim().toLowerCase() || null;
    if (mail) {
      const found = one(byAddress.get(mail));
      if (found) return found;
    }
    for (const f of name ? forms(name) : []) {
      const found = one(byName.get(f));
      if (found) return found;
    }
    // The address's local part as a name: camille.martin, martin_camille.
    const local = mail?.split("@")[0];
    return local && /[._-]/u.test(local) ? one(byName.get(fold(local))) : null;
  };
}
