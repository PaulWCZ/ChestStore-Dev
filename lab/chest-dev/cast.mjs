// The sample people of the dev harness: the same ids in every tool's seed
// (seed/sample.sql) and tests (test/support/members.ts), so screenshots and
// runs look like a real small company.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const id = name => "mbr_" + name + "a".repeat(26 - name.length);
const gid = name => "grp_" + name + "a".repeat(26 - name.length);

export const cast = {
  groups: [
    { id: gid("office"), name: "Office" },
    { id: gid("sales"), name: "Sales" },
    { id: gid("tech"), name: "Tech" },
  ],
  // strength: "first" gets the tool's first (strongest) role, "last" its
  // last, "none" no role; a tool may give anyone another role in
  // docs/dev.json {"roles": {"ines": "approver"}}. language: the one the
  // Chest speaks to them (SDK 0.3.0, was locale). Everyone works in the
  // Chest's zone (CHEST_TIME_ZONE) unless docs/dev.json says otherwise
  // ({"timeZones": {"tom": "America/Montreal"}}) or the harness runs with
  // --elsewhere (Tom works from Montréal: elsewhere below).
  people: [
    { key: "camille", firstName: "Camille", lastName: "Martin", language: "fr", admin: true, groups: ["office"], strength: "first" },
    { key: "ines", firstName: "Inès", lastName: "Moreau", language: "fr", groups: ["sales"], strength: "last" },
    { key: "hugo", firstName: "Hugo", lastName: "Bernard", language: "en", groups: ["sales"], strength: "last" },
    { key: "lea", firstName: "Léa", lastName: "Dubois", language: "fr", groups: ["tech"], strength: "last" },
    { key: "tom", firstName: "Tom", lastName: "Walker", language: "en", groups: ["tech"], strength: "last" },
    { key: "sofia", firstName: "Sofia", lastName: "Rossi", language: "en", groups: ["office"], strength: "last" },
    { key: "nora", firstName: "Nora", lastName: "Petit", language: "fr", groups: [], strength: "none" },
  ],
};

// The member who works away from the company with --elsewhere, and where:
// six hours behind Paris, so their day and the Chest's differ every evening.
export const elsewhere = { key: "tom", timeZone: "America/Montreal" };

export function castFor(manifest, toolFolder, { zone = "Europe/Paris", elsewhere: away = false } = {}) {
  const roles = manifest.roles ?? [];
  const dev = existsSync(join(toolFolder, "docs", "dev.json")) ? JSON.parse(readFileSync(join(toolFolder, "docs", "dev.json"), "utf8")) : {};
  const extra = dev.roles ?? {};
  const zones = { ...(away ? { [elsewhere.key]: elsewhere.timeZone } : {}), ...(dev.timeZones ?? {}) };
  return cast.people.map(p => {
    const role = p.key in extra ? extra[p.key] : p.strength === "first" ? roles[0] ?? null : p.strength === "last" ? roles.at(-1) ?? null : null;
    return {
      id: id(p.key),
      firstName: p.firstName,
      lastName: p.lastName,
      name: `${p.firstName} ${p.lastName}`,
      photo: `/_chest/members/${id(p.key)}/photo`,
      role,
      isAdmin: Boolean(p.admin),
      isBuilder: false,
      groups: p.groups.map(gid),
      language: p.language,
      timeZone: zones[p.key] ?? zone,
      email: `${p.key}@example.test`,
    };
  });
}
