import { Avatar } from "@argentic/chest-ui/components";

// A person as a line: their photo (or initials) and name; someone who left
// reads "(former member)". The kit's avatar is decorative here: the name is
// written beside it.
export function PersonLine({ person, size = "s" }: { person: { name: string; photo: string | null; gone: boolean }; size?: "s" | "m" }) {
  return (
    <span className="person">
      <Avatar name={person.name} photo={person.photo} size={size} />
      <span>{person.name}</span>
    </span>
  );
}
