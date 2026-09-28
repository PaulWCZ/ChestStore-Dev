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
  // docs/dev.json {"roles": {"ines": "approver"}}.
  people: [
    { key: "camille", firstName: "Camille", lastName: "Martin", locale: "fr", admin: true, groups: ["office"], strength: "first" },
    { key: "ines", firstName: "Inès", lastName: "Moreau", locale: "fr", groups: ["sales"], strength: "last" },
    { key: "hugo", firstName: "Hugo", lastName: "Bernard", locale: "en", groups: ["sales"], strength: "last" },
    { key: "lea", firstName: "Léa", lastName: "Dubois", locale: "fr", groups: ["tech"], strength: "last" },
    { key: "tom", firstName: "Tom", lastName: "Walker", locale: "en", groups: ["tech"], strength: "last" },
    { key: "sofia", firstName: "Sofia", lastName: "Rossi", locale: "en", groups: ["office"], strength: "last" },
    { key: "nora", firstName: "Nora", lastName: "Petit", locale: "fr", groups: [], strength: "none" },
  ],
};

export function castFor(manifest, toolFolder) {
  const roles = manifest.roles ?? [];
  const extra = existsSync(join(toolFolder, "docs", "dev.json")) ? JSON.parse(readFileSync(join(toolFolder, "docs", "dev.json"), "utf8")).roles ?? {} : {};
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
      locale: p.locale,
      email: `${p.key}@example.test`,
    };
  });
}
