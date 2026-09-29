// The words the kit's components show when a tool does not bring its own:
// English (the first language, the default and the fallback) and French.
// A tool passes a section to a component (`labels={kitWords.fr.toast}`), or
// its own object of the same shape from its catalogue. Adding a language is
// one more object of the type `KitWords` — nothing else in the kit names a
// language.
//
// These are plain data (no function): a server component may pass them to
// a client component. French follows the store's glossary (lab/GLOSSARY.md):
// Undo is « Annuler l’action » (never « Annuler », which is Cancel), a
// narrow no-break space (U+202F) before : ; ? ! and inside « ».

export type Plural = { readonly zero?: string; readonly one: string; readonly other: string };

export type ToastWords = {
  readonly region: string;
  readonly undo: string;
  readonly undoing: string;
  readonly undone: string;
  readonly undoFailed: string;
  readonly dismiss: string;
};

export type DialogWords = {
  readonly close: string;
  readonly discardTitle: string;
  readonly discardBody: string;
  readonly keepEditing: string;
  readonly discard: string;
};

export type PeoplePickerWords = {
  readonly placeholder: string;
  readonly noMatch: string;
  readonly searching: string;
  readonly failed: string;
  readonly recent: string;
  // A heading for suggestions that are not the person's recent choices
  // ("Suggested"), for `suggestionsLabel` (0.2.1).
  readonly suggested?: string;
  readonly people: string;
  readonly groups: string;
  readonly remove: string;
  readonly results: Plural;
  readonly groupSize: Plural;
  readonly chosen: string;
};

export type DateWords = {
  readonly order: "dmy" | "mdy" | "ymd";
  readonly separator: string;
  readonly placeholder: string;
  readonly months: readonly string[];
  readonly monthsShort: readonly string[];
  readonly weekdays: readonly string[];
  readonly weekdaysShort: readonly string[];
  readonly weekStart: 0 | 1;
  readonly long: string;
  readonly short: string;
  readonly monthYear: string;
  readonly today: string;
  readonly tomorrow: string;
  readonly yesterday: string;
  readonly openCalendar: string;
  readonly closeCalendar: string;
  readonly previousMonth: string;
  readonly nextMonth: string;
  readonly invalid: string;
  readonly tooEarly: string;
  readonly tooLate: string;
  readonly otherDay: string;
  readonly pickDay: string;
};

export type FileWords = {
  readonly add: string;
  readonly addOne: string;
  readonly drop: string;
  // The same for a single file ("or drop it here"); `drop` when absent (0.2.1).
  readonly dropOne?: string;
  readonly limits: string;
  readonly limitsOne: string;
  readonly types: string;
  readonly list: string;
  readonly remove: string;
  readonly sending: string;
  readonly ready: string;
  readonly failed: string;
  readonly retry: string;
  readonly tooBig: string;
  readonly wrongType: string;
  readonly tooMany: string;
  readonly units: readonly [string, string, string, string];
  readonly decimal: string;
  // 0.2.2 (optional: the kit's English when absent) —
  // `camera`'s two buttons on a phone:
  readonly takePhoto?: string;
  readonly chooseFile?: string;
  // what a family of types is called in "Accepted: …" (image/* → images):
  readonly kinds?: { readonly image: string; readonly audio: string; readonly video: string; readonly text: string };
  // between a button's words and the field's name, for screen readers
  // ("Add files: Receipts"; French « Ajouter des fichiers : Justificatifs »):
  readonly separator?: string;
};

export type TableWords = {
  readonly rowActions: string;
  readonly rowActionsFor: string;
  readonly total: string;
  readonly scroll: string;
};

export type FilterWords = {
  readonly label: string;
  readonly clear: string;
  readonly all: string;
  // A select filter's button where no script runs ("Show") (0.2.2).
  readonly apply?: string;
};

export type SearchWords = {
  readonly label: string;
  readonly placeholder: string;
  readonly shortcut: string;
  readonly submit: string;
};

export type ShellWords = {
  readonly skip: string;
  readonly nav: string;
  readonly language: string;
  readonly noAccessTitle: string;
  readonly noAccessBody: string;
  readonly more: Plural;
  readonly example: string;
  readonly menu: string;
};

export type KitWords = {
  readonly lang: string;
  readonly toast: ToastWords;
  readonly dialog: DialogWords;
  readonly peoplePicker: PeoplePickerWords;
  readonly date: DateWords;
  readonly files: FileWords;
  readonly table: TableWords;
  readonly filters: FilterWords;
  readonly search: SearchWords;
  readonly shell: ShellWords;
};

const nnbsp = " ";

export const en: KitWords = {
  lang: "en",
  toast: {
    region: "Notifications",
    undo: "Undo",
    undoing: "Undoing…",
    undone: "Undone.",
    undoFailed: "It could not be undone. Try again from the page.",
    dismiss: "Dismiss",
  },
  dialog: {
    close: "Close",
    discardTitle: "Discard your changes?",
    discardBody: "What you typed here will be lost.",
    keepEditing: "Keep editing",
    discard: "Discard",
  },
  peoplePicker: {
    placeholder: "Type a name",
    noMatch: "No one by that name",
    searching: "Searching…",
    failed: "The search did not answer. Try again.",
    recent: "Recent",
    suggested: "Suggested",
    people: "People",
    groups: "Groups",
    remove: "Remove {name}",
    results: { zero: "No results", one: "{count} result", other: "{count} results" },
    groupSize: { one: "{count} person", other: "{count} people" },
    chosen: "Chosen",
  },
  date: {
    order: "dmy",
    separator: "/",
    placeholder: "dd/mm/yyyy",
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    weekdaysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    weekStart: 1,
    long: "{weekday} {day} {month} {year}",
    short: "{weekday} {day} {month}",
    monthYear: "{month} {year}",
    today: "Today",
    tomorrow: "Tomorrow",
    yesterday: "Yesterday",
    openCalendar: "Choose on a calendar",
    closeCalendar: "Close the calendar",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    invalid: "Type a date like {example}.",
    tooEarly: "Choose {date} or later.",
    tooLate: "Choose {date} or earlier.",
    otherDay: "Another day…",
    pickDay: "Choose a day",
  },
  files: {
    add: "Add files",
    addOne: "Add a file",
    drop: "or drop them here",
    dropOne: "or drop it here",
    limits: "Up to {count} files, {size} each.",
    limitsOne: "One file, {size} at most.",
    types: "Accepted: {types}.",
    list: "Files",
    remove: "Remove {name}",
    sending: "Sending… {percent}%",
    ready: "Ready",
    failed: "Not sent",
    retry: "Try again",
    tooBig: "{name} is too big: {size} at most.",
    wrongType: "{name}: this kind of file is not accepted.",
    tooMany: "{count} files at most.",
    units: ["B", "KB", "MB", "GB"],
    decimal: ".",
    takePhoto: "Take a photo",
    chooseFile: "Choose a file",
    kinds: { image: "images", audio: "sound files", video: "videos", text: "text files" },
    separator: ": ",
  },
  table: {
    rowActions: "Actions",
    rowActionsFor: "Actions for {name}",
    total: "Total",
    scroll: "{caption} (scrolls sideways)",
  },
  filters: {
    label: "Filters",
    clear: "Clear filters",
    all: "All",
    apply: "Show",
  },
  search: {
    label: "Search",
    placeholder: "Search",
    shortcut: "Press / to search",
    submit: "Search",
  },
  shell: {
    skip: "Skip to content",
    nav: "Main",
    language: "Language",
    noAccessTitle: "You can’t use this tool yet",
    noAccessBody: "Your role gives no access. Ask an administrator of your Chest to give you a role.",
    more: { one: "and {count} other", other: "and {count} others" },
    example: "Start with an example",
    menu: "More",
  },
};

export const fr: KitWords = {
  lang: "fr",
  toast: {
    region: "Notifications",
    undo: "Annuler l’action",
    undoing: "Annulation…",
    undone: "Action annulée.",
    undoFailed: `L’action n’a pas pu être annulée. Réessayez depuis la page.`,
    dismiss: "Fermer",
  },
  dialog: {
    close: "Fermer",
    discardTitle: `Abandonner vos modifications${nnbsp}?`,
    discardBody: "Ce que vous avez saisi ici sera perdu.",
    keepEditing: "Continuer",
    discard: "Abandonner",
  },
  peoplePicker: {
    placeholder: "Tapez un nom",
    noMatch: "Personne à ce nom",
    searching: "Recherche…",
    failed: "La recherche n’a pas répondu. Réessayez.",
    recent: "Récents",
    suggested: "Suggestions",
    people: "Personnes",
    groups: "Groupes",
    remove: "Retirer {name}",
    results: { zero: "Aucun résultat", one: "{count} résultat", other: "{count} résultats" },
    groupSize: { one: "{count} personne", other: "{count} personnes" },
    chosen: "Choisis",
  },
  date: {
    order: "dmy",
    separator: "/",
    placeholder: "jj/mm/aaaa",
    months: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    monthsShort: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
    weekdays: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    weekdaysShort: ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."],
    weekStart: 1,
    long: "{weekday} {day} {month} {year}",
    short: "{weekday} {day} {month}",
    monthYear: "{month} {year}",
    today: "Aujourd’hui",
    tomorrow: "Demain",
    yesterday: "Hier",
    openCalendar: "Choisir sur un calendrier",
    closeCalendar: "Fermer le calendrier",
    previousMonth: "Mois précédent",
    nextMonth: "Mois suivant",
    invalid: "Tapez une date comme {example}.",
    tooEarly: "Choisissez le {date} ou après.",
    tooLate: "Choisissez le {date} ou avant.",
    otherDay: "Un autre jour…",
    pickDay: "Choisir un jour",
  },
  files: {
    add: "Ajouter des fichiers",
    addOne: "Ajouter un fichier",
    drop: "ou déposez-les ici",
    dropOne: "ou déposez-le ici",
    limits: "Jusqu’à {count} fichiers, {size} chacun.",
    limitsOne: "Un fichier, {size} au plus.",
    types: `Acceptés${nnbsp}: {types}.`,
    list: "Fichiers",
    remove: "Retirer {name}",
    sending: `Envoi… {percent}${nnbsp}%`,
    ready: "Prêt",
    failed: "Non envoyé",
    retry: "Réessayer",
    tooBig: `{name} est trop lourd${nnbsp}: {size} au plus.`,
    wrongType: `{name}${nnbsp}: ce type de fichier n’est pas accepté.`,
    tooMany: "{count} fichiers au plus.",
    units: ["o", "Ko", "Mo", "Go"],
    decimal: ",",
    takePhoto: "Prendre une photo",
    chooseFile: "Choisir un fichier",
    kinds: { image: "images", audio: "fichiers audio", video: "vidéos", text: "fichiers texte" },
    separator: `${nnbsp}: `,
  },
  table: {
    rowActions: "Actions",
    rowActionsFor: "Actions pour {name}",
    total: "Total",
    scroll: "{caption} (défile sur le côté)",
  },
  filters: {
    label: "Filtres",
    clear: "Retirer les filtres",
    all: "Tout",
    apply: "Afficher",
  },
  search: {
    label: "Rechercher",
    placeholder: "Rechercher",
    shortcut: "Appuyez sur / pour rechercher",
    submit: "Rechercher",
  },
  shell: {
    skip: "Aller au contenu",
    nav: "Principal",
    language: "Langue",
    noAccessTitle: "Vous ne pouvez pas encore utiliser cet outil",
    noAccessBody: "Votre rôle ne donne aucun accès. Demandez à un administrateur de votre Chest de vous en donner un.",
    more: { one: "et {count} autre", other: "et {count} autres" },
    example: "Commencer avec un exemple",
    menu: "Plus",
  },
};

// The kit's words per language code; unknown codes get English.
export const kitWords: Readonly<Record<string, KitWords>> = { en, fr };

export function wordsFor(locale: string | null | undefined): KitWords {
  return (locale && kitWords[locale]) || en;
}

// A tool's catalogue may hold date words of its own (a JSON file, or an
// object without `as const`): there `order` is a string and `weekStart` a
// number, which the DateWords type refuses. `dateWords` takes them so and
// gives DateWords back, checked (0.2.1):
//   date: dateWords(catalogue.date)                   // a whole section
//   date: dateWords({ ...fr.date, today: "Ce jour" })  // the kit's, one word changed
export type DateWordsInput = Omit<DateWords, "order" | "weekStart"> & { readonly order: string; readonly weekStart: number };

export function dateWords(words: DateWordsInput): DateWords {
  const { order, weekStart } = words;
  if (order !== "dmy" && order !== "mdy" && order !== "ymd") throw new RangeError(`date words: order is "dmy", "mdy" or "ymd", not ${JSON.stringify(order)}`);
  if (weekStart !== 0 && weekStart !== 1) throw new RangeError(`date words: weekStart is 0 (Sunday) or 1 (Monday), not ${weekStart}`);
  for (const [key, count] of [["months", 12], ["monthsShort", 12], ["weekdays", 7], ["weekdaysShort", 7]] as const) {
    if (words[key].length !== count) throw new RangeError(`date words: ${key} holds ${count} names, not ${words[key].length}`);
  }
  return { ...words, order, weekStart };
}

export type Language = { readonly code: string; readonly name: string };

// The languages the store's tools speak today, each named in itself (never
// translated): the LanguageSwitch's list. Data, so it lives here and not
// in the client barrel (a server component would get a client reference).
export const storeLanguages: readonly Language[] = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
];
