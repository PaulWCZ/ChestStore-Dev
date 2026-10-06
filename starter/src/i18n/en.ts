import { en as kit } from "@argentic/chest-ui/components/logic";

// English: the source catalogue, the default and the fallback. Every word
// the tool shows is here, and in every other catalogue with the same keys
// (tsc checks the shape, test/units.test.ts the placeholders and French
// typography). {name} is a value fill() puts in; {one, other} (and zero)
// is a plural: f.plural(). tool, pages, errors and kit are what
// @argentic/chest-app needs; the rest is the tool's.
export const en = {
  kit,
  tool: { name: "Notes" },
  pages: {
    notFound: { title: "Nothing here", body: "This page does not exist, or it was deleted." },
    forbidden: { title: "Not allowed", body: "Your role does not allow this. Ask whoever manages the tool." },
    failed: { title: "Something went wrong", body: "Try again in a moment. If it goes on, tell whoever manages the tool." },
    signIn: "Open this tool from your Chest.",
    busy: "Still sending…",
    language: "Language",
  },
  errors: {
    invalid: "Check what you wrote.",
    empty: "Write something first.",
    too_long: "Too long: {max} characters at most.",
    too_large: "Too large to send.",
    forbidden: "Your role does not allow this.",
    not_found: "This no longer exists.",
    unavailable: "The Chest did not answer. Try again in a moment.",
    unknown: "Something went wrong. Try again.",
    busy: "Too many messages today. Try again tomorrow.",
  },
  // EXAMPLE (Notes)
  people: { former: "{name} (former member)", noAccess: "{name} (no access)", erased: "Former member", unknown: "Unknown member" },
  home: {
    title: "Notes",
    count: { one: "{count} note", other: "{count} notes" },
    label: "New note",
    placeholder: "A reminder, a piece of news, a thank-you…",
    post: "Post",
    pin: "Pin",
    unpin: "Unpin",
    pinned: "Pinned",
    remove: "Delete",
    removed: "Note deleted.",
    export: "Download as CSV",
    by: "{name}, {date}",
    fromVisitor: "From the public page, {date}",
    empty: { title: "No notes yet", body: "Post the first one: everyone who has the tool sees it." },
  },
  contact: {
    title: "Write to the team",
    intro: "Your message reaches the team's notes. Do not write personal details.",
    label: "Your message",
    send: "Send",
    sent: "Thank you: the team has your message.",
  },
};
