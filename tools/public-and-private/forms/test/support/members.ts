import type { FakeMember } from "@argentic/chest-sdk/testing";

// The people of the tests (and of the dev harness, lab/chest-dev): ids of
// the Chest's shape, one per role, French and English speakers.
const id = (name: string): string => "mbr_" + name + "a".repeat(26 - name.length);
export const groups = { office: "grp_officeaaaaaaaaaaaaaaaaaaaa", sales: "grp_salesaaaaaaaaaaaaaaaaaaaaa" } as const;

const person = (key: string, firstName: string, lastName: string, role: string | null, extra: Partial<FakeMember> = {}): FakeMember => ({
  id: id(key), firstName, lastName, name: `${firstName} ${lastName}`, photo: null, role, isAdmin: false, isBuilder: false, groups: [], locale: "en", email: `${key}@example.test`, ...extra,
});

export const camille = person("camille", "Camille", "Martin", "manager", { isAdmin: true, locale: "fr", groups: [groups.office] });
export const ines = person("ines", "Inès", "Moreau", "creator", { locale: "fr", groups: [groups.sales] });
export const hugo = person("hugo", "Hugo", "Bernard", "member", { groups: [groups.sales] });
export const lea = person("lea", "Léa", "Dubois", "member", { locale: "fr" });
export const tom = person("tom", "Tom", "Walker", "member");
export const sofia = person("sofia", "Sofia", "Rossi", "member");
export const nora = person("nora", "Nora", "Petit", null);
export const everyone = [camille, ines, hugo, lea, tom, sofia, nora];
