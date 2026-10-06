import { fr as kit } from "@argentic/chest-ui/components/logic";
import type { Catalogue } from "./index.ts";

// French: the same keys as en.ts (tsc refuses a missing or extra one).
// A narrow no-break space (U+202F) before : ; ? ! (test/units.test.ts).
export const fr: Catalogue = {
  kit,
  tool: { name: "Notes" },
  pages: {
    notFound: { title: "Rien ici", body: "Cette page n’existe pas, ou elle a été supprimée." },
    forbidden: { title: "Non autorisé", body: "Votre rôle ne le permet pas. Demandez à qui gère l’outil." },
    failed: { title: "Un problème est survenu", body: "Réessayez dans un instant. Si cela continue, prévenez qui gère l’outil." },
    signIn: "Ouvrez cet outil depuis votre Chest.",
    busy: "Envoi en cours…",
    language: "Langue",
  },
  errors: {
    invalid: "Vérifiez ce que vous avez écrit.",
    empty: "Écrivez d’abord quelque chose.",
    too_long: "Trop long : {max} caractères au plus.",
    too_large: "Trop volumineux pour être envoyé.",
    forbidden: "Votre rôle ne le permet pas.",
    not_found: "Cela n’existe plus.",
    unavailable: "Le Chest n’a pas répondu. Réessayez dans un instant.",
    unknown: "Un problème est survenu. Réessayez.",
    busy: "Trop de messages aujourd’hui. Réessayez demain.",
  },
  // EXAMPLE (Notes)
  people: { former: "{name} (ancien membre)", noAccess: "{name} (sans accès)", erased: "Ancien membre", unknown: "Membre inconnu" },
  home: {
    title: "Notes",
    count: { one: "{count} note", other: "{count} notes" },
    label: "Nouvelle note",
    placeholder: "Un rappel, une nouvelle, un merci…",
    post: "Publier",
    pin: "Épingler",
    unpin: "Désépingler",
    pinned: "Épinglée",
    remove: "Supprimer",
    removed: "Note supprimée.",
    export: "Télécharger en CSV",
    by: "{name}, {date}",
    fromVisitor: "Depuis la page publique, {date}",
    empty: { title: "Aucune note pour l’instant", body: "Publiez la première : tous ceux qui ont l’outil la voient." },
  },
  contact: {
    title: "Écrire à l’équipe",
    intro: "Votre message rejoint les notes de l’équipe. N’y mettez pas de données personnelles.",
    label: "Votre message",
    send: "Envoyer",
    sent: "Merci : l’équipe a bien reçu votre message.",
  },
};
