// Safe in the browser: no SDK here.
// A leave type's name in the reader's language: HR's own name, or the
// built-in type's name in the catalogue.
export function typeName(type: { key: string | null; name: string | null } | undefined, words: { readonly [key: string]: string }): string {
  if (!type) return "";
  if (type.name) return type.name;
  return (type.key && words[type.key]) || "";
}
