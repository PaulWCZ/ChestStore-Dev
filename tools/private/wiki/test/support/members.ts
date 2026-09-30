import type { FakeMember } from "@argentic/chest-sdk/testing";

// The people of the tests (and of the dev harness, lab/chest-dev): ids of
// the Chest's shape, each role, French and English speakers, in groups.
const id = (name: string): string => "mbr_" + name + "a".repeat(26 - name.length);
export const groups = { office: "grp_officeaaaaaaaaaaaaaaaaaaaa", sales: "grp_salesaaaaaaaaaaaaaaaaaaaaa", tech: "grp_techaaaaaaaaaaaaaaaaaaaaaa" } as const;

const person = (key: string, firstName: string, lastName: string, role: string | null, extra: Partial<FakeMember> = {}): FakeMember => ({
  id: id(key), firstName, lastName, name: `${firstName} ${lastName}`, photo: null, role, isAdmin: false, isBuilder: false, groups: [], language: "en", ...extra,
});

// Camille: an editor and the Chest's admin. Inès and Tom: editors. Hugo and
// Léa: readers. Nora: no role in the wiki.
export const camille = person("camille", "Camille", "Martin", "editor", { isAdmin: true, language: "fr", groups: [groups.office] });
export const ines = person("ines", "Inès", "Moreau", "editor", { language: "fr", groups: [groups.sales] });
export const tom = person("tom", "Tom", "Walker", "editor", { groups: [groups.tech] });
export const hugo = person("hugo", "Hugo", "Bernard", "reader", { groups: [groups.sales] });
export const lea = person("lea", "Léa", "Dubois", "reader", { language: "fr", groups: [groups.tech] });
export const nora = person("nora", "Nora", "Petit", null);
export const everyone = [camille, ines, tom, hugo, lea, nora];
