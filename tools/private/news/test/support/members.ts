import type { FakeMember } from "@argentic/chest-sdk/testing";

// The people of the tests (and of the dev harness, lab/chest-dev): ids of
// the Chest's shape, both roles, French and English speakers, and someone
// without a role.
const id = (name: string): string => "mbr_" + name + "a".repeat(26 - name.length);
export const groups = { office: "grp_officeaaaaaaaaaaaaaaaaaaaa", sales: "grp_salesaaaaaaaaaaaaaaaaaaaaa" } as const;

const person = (key: string, firstName: string, lastName: string, role: string | null, extra: Partial<FakeMember> = {}): FakeMember => ({
  id: id(key), firstName, lastName, name: `${firstName} ${lastName}`, photo: null, role, isAdmin: false, isBuilder: false, groups: [], locale: "en", ...extra,
});

export const camille = person("camille", "Camille", "Martin", "publisher", { isAdmin: true, locale: "fr", groups: [groups.office] });
export const sofia = person("sofia", "Sofia", "Rossi", "publisher", { groups: [groups.office] });
export const ines = person("ines", "Inès", "Moreau", "reader", { locale: "fr", groups: [groups.sales] });
export const hugo = person("hugo", "Hugo", "Bernard", "reader", { groups: [groups.sales] });
export const lea = person("lea", "Léa", "Dubois", "reader", { locale: "fr" });
export const nora = person("nora", "Nora", "Petit", "reader", { locale: "fr" });
export const stranger = person("tom", "Tom", "Walker", null);
export const everyone = [camille, sofia, ines, hugo, lea, nora, stranger];

// The groups the fake Chest lists (those that give News), with their members.
export const fakeGroups = [
  { id: groups.office, name: "Office", members: [camille.id, sofia.id] },
  { id: groups.sales, name: "Sales", members: [ines.id, hugo.id] },
];
