import type { Catalogue } from "./index.ts";

// French: the second language, complete — the same keys as English.
export const fr: Catalogue = {
  meta: {
    lang: "fr",
    name: "Notes",
    tagline: "Des notes courtes pour toute l’équipe.",
  },
  http: {
    signIn: "Connectez-vous par votre Chest pour ouvrir cette page.",
  },
  public: {
    title: "Cet outil se trouve dans votre Chest",
    body: "Ouvrez-le depuis l’accueil de votre Chest, connecté avec votre compte de travail.",
    language: "Langue",
  },
  notFound: {
    title: "Rien ici",
    body: "Cette page n’existe pas, ou elle a été supprimée.",
    back: "Retour aux notes",
  },
  roles: {
    manager: "Responsable",
    member: "Membre",
    none: "Aucun rôle",
  },
  shell: {
    skip: "Aller au contenu",
    main: "Principal",
  },
  noAccess: {
    title: "Vous ne pouvez pas encore utiliser cet outil",
    body: "Votre rôle ne donne aucun accès. Demandez à un administrateur de votre Chest de vous donner un rôle.",
  },
  people: {
    former: "{name} (ancien membre)",
    erased: "Ancien membre",
    unknown: "Membre inconnu",
    you: "Vous",
  },
  notes: {
    title: "Notes",
    placeholder: "Écrivez une note pour l’équipe…",
    add: "Publier",
    adding: "Publication…",
    empty: {
      title: "Aucune note pour l’instant",
      body: "Publiez la première : un rappel, une nouvelle, un merci.",
      example: "Publier un exemple",
    },
    exampleText: "Bienvenue ! Les notes publiées ici sont vues par toute l’équipe.",
    count: { one: "{count} note", other: "{count} notes" },
    by: "par {name}",
    pin: "Épingler",
    unpin: "Désépingler",
    pinned: "Épinglée",
    remove: "Supprimer",
    removed: "Note supprimée.",
    readOnly: "Vous pouvez lire les notes. Demandez à un responsable de pouvoir publier.",
  },
  toast: {
    region: "Notifications",
    undo: "Annuler l’action",
    undoing: "Annulation…",
    undone: "Action annulée.",
    undoFailed: "L’action n’a pas pu être annulée. Réessayez depuis la page.",
    dismiss: "Fermer",
  },
  errors: {
    forbidden: "Votre rôle ne le permet pas.",
    not_found: "Cette note n’existe plus.",
    invalid: "Vérifiez ce que vous avez écrit.",
    too_long: "Trop long : {max} caractères au plus.",
    empty: "Écrivez d’abord quelque chose.",
    unavailable: "Le Chest n’a pas répondu. Réessayez dans un instant.",
    unknown: "Un problème est survenu. Réessayez.",
  },
  notifications: {
    pinnedTitle: "{name} a épinglé votre note",
  },
};
