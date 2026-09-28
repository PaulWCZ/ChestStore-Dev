import type { AnswerError, FormsError, Kind, Status } from "./model.ts";

// The words of the interface, one catalogue per language. English is the
// default; a request whose Accept-Language prefers French gets French. To add
// a language, add its code to `locales` and a catalogue of the same shape.

export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// localeOf picks, in the order of preference of an Accept-Language header,
// the first language this tool speaks; English when none.
export function localeOf(header: string | null | undefined): Locale {
  if (!header) return defaultLocale;
  const ranked = header
    .split(",")
    .slice(0, 32)
    .map((part, index) => {
      const [tag = "", ...params] = part.split(";").map(p => p.trim());
      const q = params.find(p => p.startsWith("q="));
      const weight = q === undefined ? 1 : Number(q.slice(2));
      return { language: tag.toLowerCase().split("-")[0] ?? "", weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter(r => r.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  const found = ranked.find(r => (locales as readonly string[]).includes(r.language));
  return found ? (found.language as Locale) : defaultLocale;
}

// Words a client component receives are plain strings (a server component
// cannot hand it a function); `{name}` marks what fill() replaces.
export const fill = (text: string, values: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));

const en = {
  lang: "en",
  dateLocale: "en-GB",
  appName: "Forms",
  home: { intro: "Open a form’s link to answer it." },
  notFound: { title: "Page not found", body: "This address leads to no form." },
  kinds: { text: "Short text", long: "Long text", email: "Email address" } satisfies Record<Kind, string>,
  statuses: { draft: "Draft", published: "Published", closed: "Closed" } satisfies Record<Status, string>,
  count: (n: number): string => (n === 0 ? "No responses" : n === 1 ? "1 response" : `${n} responses`),
  members: {
    roles: { editor: "editor", reader: "reader" } as Record<string, string>,
    noRole: "no role",
    readOnly: "read only",
    limitedTitle: "Limited access",
    limitedBody: "Your role gives no access to forms. Ask an administrator of the Chest to make you an editor or a reader.",
  },
  list: { intro: "Create a form, publish it, then find its responses here.", create: "New form", empty: "No forms yet." },
  create: {
    title: "New form",
    refused: "Your role does not allow creating a form.",
    intro: "It stays a draft, invisible outside the Chest, until you publish it.",
    submit: "Save draft",
  },
  edit: { title: "Edit", refused: "Only a draft can be edited, and only by an editor.", heading: "Edit draft", submit: "Save" },
  form: {
    status: "Status",
    draftNote: " — invisible outside the Chest",
    closedNote: " — collection stopped, responses kept",
    address: "Public address",
    addressDraft: "— leads nowhere until it is published",
    responses: "Responses",
    updated: "Last modified",
    fields: "Fields",
    required: "Required",
    optional: "Optional",
    edit: "Edit",
    publish: "Publish",
    close: "Close collection",
    remove: "Delete draft",
    refusals: {
      conflict: "This change no longer applies: the form changed status in the meantime.",
      forbidden: "Your role does not allow changing this form.",
    } as Record<string, string>,
  },
  responses: {
    title: "Responses",
    latest: (n: number): string => ` — the latest ${n} below`,
    export: "Export as CSV",
    number: "No.",
    received: "Received",
  },
  editor: {
    title: "Title",
    description: "Description",
    fields: "Fields",
    fieldCount: "{count} of {max} at most.",
    label: "Label",
    labelOf: "Label of field {n}",
    kindOf: "Type of field {n}",
    required: "Answer required",
    up: "Move up",
    remove: "Remove",
    add: "Add a field",
    errors: {
      forbidden: "Your role does not allow editing forms.",
      invalid: "Check the form: a title, 1 to 50 fields, each with a label of 200 characters at most.",
      not_found: "This form no longer exists.",
      conflict: "This form is no longer a draft: it can no longer be edited.",
      full: "This form has received all the responses it can keep.",
    } satisfies Record<FormsError["code"], string>,
  },
  answer: {
    required: " (required)",
    send: "Send",
    closed: "This form is closed.",
    notFound: "This form does not exist.",
    full: "This form has received all the responses it can keep.",
    errors: {
      unreadable: "Unreadable answer.",
      too_long: "{max} characters at most.",
      characters: "Characters not allowed.",
      required: "Answer required.",
      email: "Invalid email address.",
    } satisfies Record<AnswerError, string>,
  },
  thanks: { title: "Thank you", body: "Your response to “{title}” has been recorded." },
  http: { signIn: "Sign-in required.", forbidden: "Access denied.", notFound: "Form not found." },
};

export type Messages = typeof en;
export type EditorWords = Messages["editor"];
export type AnswerWords = Messages["answer"];

const fr: Messages = {
  lang: "fr",
  dateLocale: "fr-FR",
  appName: "Formulaires",
  home: { intro: "Ouvrez le lien d’un formulaire pour y répondre." },
  notFound: { title: "Page introuvable", body: "Cette adresse ne mène à aucun formulaire." },
  kinds: { text: "Texte court", long: "Texte long", email: "Adresse e-mail" },
  statuses: { draft: "Brouillon", published: "Publié", closed: "Fermé" },
  count: n => (n === 0 ? "Aucune réponse" : n === 1 ? "1 réponse" : `${n} réponses`),
  members: {
    roles: { editor: "éditeur", reader: "lecteur" },
    noRole: "sans rôle",
    readOnly: "lecture seule",
    limitedTitle: "Accès limité",
    limitedBody: "Votre rôle ne donne pas accès aux formulaires. Demandez à un administrateur du Chest de vous nommer éditeur ou lecteur.",
  },
  list: { intro: "Créez un formulaire, publiez-le, puis retrouvez ses réponses ici.", create: "Nouveau formulaire", empty: "Aucun formulaire pour l’instant." },
  create: {
    title: "Nouveau formulaire",
    refused: "Votre rôle ne permet pas de créer un formulaire.",
    intro: "Il reste un brouillon, invisible hors du Chest, jusqu’à ce que vous le publiiez.",
    submit: "Enregistrer le brouillon",
  },
  edit: { title: "Modifier", refused: "Seul un brouillon se modifie, et seulement par un éditeur.", heading: "Modifier le brouillon", submit: "Enregistrer" },
  form: {
    status: "État",
    draftNote: " — invisible hors du Chest",
    closedNote: " — la collecte est arrêtée, les réponses restent",
    address: "Adresse publique",
    addressDraft: "— ne mène à rien avant la publication",
    responses: "Réponses",
    updated: "Modifié le",
    fields: "Champs",
    required: "Requis",
    optional: "Facultatif",
    edit: "Modifier",
    publish: "Publier",
    close: "Fermer la collecte",
    remove: "Supprimer le brouillon",
    refusals: {
      conflict: "Ce changement ne s’applique plus : le formulaire a changé d’état entre-temps.",
      forbidden: "Votre rôle ne permet pas de changer ce formulaire.",
    },
  },
  responses: {
    title: "Réponses",
    latest: n => ` — les ${n} dernières ci-dessous`,
    export: "Exporter en CSV",
    number: "N°",
    received: "Reçue le",
  },
  editor: {
    title: "Titre",
    description: "Description",
    fields: "Champs",
    fieldCount: "{count} sur {max} au plus.",
    label: "Libellé",
    labelOf: "Libellé du champ {n}",
    kindOf: "Type du champ {n}",
    required: "Réponse requise",
    up: "Monter",
    remove: "Retirer",
    add: "Ajouter un champ",
    errors: {
      forbidden: "Votre rôle ne permet pas de modifier les formulaires.",
      invalid: "Vérifiez le formulaire : un titre, de 1 à 50 champs, chacun avec un libellé de 200 caractères au plus.",
      not_found: "Ce formulaire n’existe plus.",
      conflict: "Ce formulaire n’est plus un brouillon : il ne se modifie plus.",
      full: "Ce formulaire a reçu toutes les réponses qu’il peut garder.",
    },
  },
  answer: {
    required: " (requis)",
    send: "Envoyer",
    closed: "Ce formulaire est fermé.",
    notFound: "Ce formulaire n’existe pas.",
    full: "Ce formulaire a reçu toutes les réponses qu’il peut garder.",
    errors: {
      unreadable: "Réponse illisible.",
      too_long: "{max} caractères au plus.",
      characters: "Caractères non admis.",
      required: "Réponse requise.",
      email: "Adresse e-mail invalide.",
    },
  },
  thanks: { title: "Merci", body: "Votre réponse à « {title} » est enregistrée." },
  http: { signIn: "Connexion requise.", forbidden: "Accès refusé.", notFound: "Formulaire introuvable." },
};

const catalogues: Record<Locale, Messages> = { en, fr };

export const messagesFor = (locale: Locale): Messages => catalogues[locale];
