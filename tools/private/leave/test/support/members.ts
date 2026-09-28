import type { FakeMember } from "@argentic/chest-sdk/testing";

// The people of the tests — the same as the dev harness's cast
// (lab/chest-dev/cast.mjs, docs/dev.json): ids of the Chest's shape, each
// role, French and English speakers.
const id = (name: string): string => "mbr_" + name + "a".repeat(26 - name.length);
export const groups = { office: "grp_officeaaaaaaaaaaaaaaaaaaaa", sales: "grp_salesaaaaaaaaaaaaaaaaaaaaa", tech: "grp_techaaaaaaaaaaaaaaaaaaaaaa" } as const;

const person = (key: string, firstName: string, lastName: string, role: string | null, extra: Partial<FakeMember> = {}): FakeMember => ({
  id: id(key), firstName, lastName, name: `${firstName} ${lastName}`, photo: null, role, isAdmin: false, isBuilder: false, groups: [], locale: "en", ...extra,
});

export const camille = person("camille", "Camille", "Martin", "hr", { isAdmin: true, locale: "fr", groups: [groups.office] });
export const ines = person("ines", "Inès", "Moreau", "manager", { locale: "fr", groups: [groups.sales] });
export const hugo = person("hugo", "Hugo", "Bernard", "employee", { groups: [groups.sales] });
export const lea = person("lea", "Léa", "Dubois", "manager", { locale: "fr", groups: [groups.tech] });
export const tom = person("tom", "Tom", "Walker", "employee", { groups: [groups.tech] });
export const sofia = person("sofia", "Sofia", "Rossi", "employee", { groups: [groups.office] });
export const nora = person("nora", "Nora", "Petit", null);
export const everyone = [camille, ines, hugo, lea, tom, sofia, nora];
export const fakeGroups = [
  { id: groups.office, name: "Office", members: [camille.id, sofia.id] },
  { id: groups.sales, name: "Sales", members: [ines.id, hugo.id] },
  { id: groups.tech, name: "Tech", members: [lea.id, tom.id] },
];
