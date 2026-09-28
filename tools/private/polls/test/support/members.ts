import type { FakeMember } from "@argentic/chest-sdk/testing";

// The people of the tests (the same ids as the dev harness, lab/chest-dev):
// both roles, French and English speakers, two groups, an admin, and
// someone without a role.
const id = (name: string): string => "mbr_" + name + "a".repeat(26 - name.length);
export const groups = { office: "grp_officeaaaaaaaaaaaaaaaaaaaa", sales: "grp_salesaaaaaaaaaaaaaaaaaaaaa", tech: "grp_techaaaaaaaaaaaaaaaaaaaaaa" } as const;

const person = (key: string, firstName: string, lastName: string, role: string | null, extra: Partial<FakeMember> = {}): FakeMember => ({
  id: id(key), firstName, lastName, name: `${firstName} ${lastName}`, photo: null, role, isAdmin: false, isBuilder: false, groups: [], locale: "en", ...extra,
});

export const camille = person("camille", "Camille", "Martin", "organiser", { isAdmin: true, locale: "fr", groups: [groups.office] });
export const sofia = person("sofia", "Sofia", "Rossi", "organiser", { groups: [groups.office] });
export const ines = person("ines", "Inès", "Moreau", "member", { locale: "fr", groups: [groups.sales] });
export const hugo = person("hugo", "Hugo", "Bernard", "member", { groups: [groups.sales] });
export const lea = person("lea", "Léa", "Dubois", "member", { locale: "fr", groups: [groups.tech] });
export const tom = person("tom", "Tom", "Walker", "member", { groups: [groups.tech] });
export const nora = person("nora", "Nora", "Petit", null, { locale: "fr" });
export const everyone = [camille, sofia, ines, hugo, lea, tom, nora];
export const chestGroups = [
  { id: groups.office, name: "Office", members: [camille.id, sofia.id] },
  { id: groups.sales, name: "Sales", members: [ines.id, hugo.id] },
  { id: groups.tech, name: "Tech", members: [lea.id, tom.id] },
];
