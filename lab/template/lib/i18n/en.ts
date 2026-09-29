// English: the source catalogue, the default and the fallback. Every word the
// tool shows is here, and in every other catalogue with the same keys
// (test/i18n.test.ts). {name} marks a value filled by format(); an entry
// with one/other is a plural (plural()).
export const en = {
  meta: {
    lang: "en",
    name: "Notes",
    tagline: "Short notes for the whole team.",
  },
  http: {
    signIn: "Sign in through your Chest to open this page.",
  },
  public: {
    title: "This tool lives in your Chest",
    body: "Open it from your Chest’s home page, signed in with your work account.",
    language: "Language",
  },
  notFound: {
    title: "Nothing here",
    body: "This page does not exist, or it was deleted.",
    back: "Back to the notes",
  },
  roles: {
    manager: "Manager",
    member: "Member",
    none: "No role",
  },
  shell: {
    skip: "Skip to content",
    main: "Main",
  },
  noAccess: {
    title: "You can’t use this tool yet",
    body: "Your role gives no access. Ask an administrator of your Chest to give you a role.",
  },
  people: {
    former: "{name} (former member)",
    erased: "Former member",
    unknown: "Unknown member",
    you: "You",
  },
  notes: {
    title: "Notes",
    placeholder: "Write a note for the team…",
    add: "Post",
    adding: "Posting…",
    empty: {
      title: "No notes yet",
      body: "Post the first one: a reminder, a piece of news, a thank-you.",
      example: "Post an example",
    },
    exampleText: "Welcome! Notes you post here are seen by the whole team.",
    count: { one: "{count} note", other: "{count} notes" },
    by: "by {name}",
    pin: "Pin",
    unpin: "Unpin",
    pinned: "Pinned",
    remove: "Delete",
    removed: "Note deleted.",
    readOnly: "You can read the notes. Ask a manager to let you post.",
  },
  // The toasts' words (the kit's ToastWords: @argentic/chest-ui/components).
  toast: {
    region: "Notifications",
    undo: "Undo",
    undoing: "Undoing…",
    undone: "Undone.",
    undoFailed: "It could not be undone. Try again from the page.",
    dismiss: "Dismiss",
  },
  errors: {
    forbidden: "Your role does not allow this.",
    not_found: "This note no longer exists.",
    invalid: "Check what you wrote.",
    too_long: "Too long: {max} characters at most.",
    empty: "Write something first.",
    unavailable: "The Chest did not answer. Try again in a moment.",
    unknown: "Something went wrong. Try again.",
  },
  notifications: {
    pinnedTitle: "{name} pinned your note",
  },
} as const;
