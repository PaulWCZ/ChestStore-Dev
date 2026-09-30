import type { FakeMember } from "@argentic/chest-sdk/testing";

// The people of the tests (and of the dev harness, lab/chest-dev): ids of
// the Chest's shape. Status has one role, editor; Nora has the tool
// without a role.
const id = (name: string): string => "mbr_" + name + "a".repeat(26 - name.length);
export const groups = { office: "grp_officeaaaaaaaaaaaaaaaaaaaa", tech: "grp_techaaaaaaaaaaaaaaaaaaaaaa" } as const;

const person = (key: string, firstName: string, lastName: string, role: string | null, extra: Partial<FakeMember> = {}): FakeMember => ({
  id: id(key), firstName, lastName, name: `${firstName} ${lastName}`, photo: null, role, isAdmin: false, isBuilder: false, groups: [], language: "en", ...extra,
});

export const camille = person("camille", "Camille", "Martin", "editor", { isAdmin: true, language: "fr", groups: [groups.office] });
export const lea = person("lea", "Léa", "Dubois", "editor", { language: "fr", groups: [groups.tech] });
export const tom = person("tom", "Tom", "Walker", "editor", { groups: [groups.tech] });
export const nora = person("nora", "Nora", "Petit", null, { language: "fr" });
export const everyone = [camille, lea, tom, nora];
