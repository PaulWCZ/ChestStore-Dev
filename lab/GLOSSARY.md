# The store's glossary

One word per idea, in every tool, in both languages. An employee moves from
Tasks to Leave to Rooms in the same morning: the same act must have the same
name, and a French word must never mean two things on one screen (Rooms'
toast "Réservation annulée. **Annuler**" — which "Annuler"?). Source:
reports/05-critique/_store.md §2 (points 3, 4, 5, 6, 12, 15).

`node scripts/lint-words.mjs <tool folder>` checks a tool's
`lib/i18n/en.ts` and `fr.ts` against this page (report only; exit 1 when
an error is found). The kit's own words (`ui/src/components/words.ts`)
follow it and are tested against it.

## Acts

| English | French | Means | Never |
|---|---|---|---|
| **Remove** | **Retirer** | take out of a list; nothing is lost (a guest from a meeting, a tag from a card, a file from a message before sending) | "Supprimer" for this |
| **Delete** | **Supprimer** | the thing is gone for everyone — with Undo (a toast) or a Trash | "Retirer", "Effacer" for this |
| **Erase** | **Effacer** | personal data erased for good (GDPR); irreversible; asks first in a `Confirm` | "Supprimer" for this; "Effacer" for anything else (not "Effacer les filtres": **Retirer les filtres**) |
| **Undo** | **Annuler l’action** | reverses what was just done (the toast's button) | "Annuler" (that is Cancel), "Rétablir" (that is Restore/Redo), "Défaire" |
| **Cancel** | **Annuler** | leave a form or a dialog without doing anything; cancel a booking, a leave request | "Annuler l’action" for this |
| **Archive** | **Archiver** | put aside, still findable, restorable | "Supprimer" |
| **Restore** | **Restaurer** | bring back from Archive or Trash | "Rétablir" for Undo |
| **Save** | **Enregistrer** | keep the changes of a form | "Sauvegarder" (that is a backup) |
| **Assign** (a task, a ticket, a step) | **Attribuer** (à quelqu’un) | make someone responsible | "Assigner" (legal: to summon to court), "Affecter" |
| **Give** (an item, a seat, a role) | **Donner** / **Remettre** (an object handed over) | hand something to someone | "Attribuer" for an object |
| **Send** | **Envoyer** | it leaves the Chest (an email, an invitation): never offers Undo once sent | — |
| **Share** | **Partager** | give others access | — |

## Places and words of the interface

| English | French | Note |
|---|---|---|
| **Settings** | **Réglages** | the nav word in every tool; sub-pages may be specific ("Stages and interviewers") |
| Search | Rechercher | the box's label; "/" focuses it |
| Filters / Clear filters | Filtres / Retirer les filtres | |
| Today / Tomorrow / Yesterday | Aujourd’hui / Demain / Hier | the words `parseDate` also reads |
| Start with an example | Commencer avec un exemple | the empty state's second action |
| Skip to content | Aller au contenu | |
| You can’t use this tool yet | Vous ne pouvez pas encore utiliser cet outil | the no-access page |
| (former member) | (ancien membre) | a departed person's name |

## Confirmations

- Reversible act: do it, then a toast with **Undo / Annuler l’action**. No
  "Are you sure?" / "Êtes-vous sûr ?".
- Irreversible act (Erase, a sent email): a `Confirm` dialog in the page —
  **never the browser's `window.confirm`** (a grey box in the computer's
  language). Its button repeats the verb ("Erase", not "OK" / "Yes").
- Once an email or a notification left, never offer Undo (say "Sent").

## Dates and times

- **Recency** (when was this touched): relative — "3 days ago" / "il y a
  3 jours", "yesterday" / "hier".
- **Deadlines and appointments**: absolute, with the weekday when within a
  fortnight — "Due Tue 13 Oct" / "À rendre mar. 13 oct.", "Thursday 1
  October 2026" / "jeudi 1 octobre 2026".
- **Numeric dates**: day/month/year in both languages (English is written
  as in Europe: 29/09/2026). Never `mm/dd/yyyy`.
- **Times**: 24-hour, "09:30", "24:00" for the end of a day. Never AM/PM.
  French may write "9 h 30" in running text, "09:30" in a field.
- French: weekdays and months take no capital ("mardi 29 septembre").
- Fields: the kit's `DateField` and `TimeSelect`, never the browser's
  `type="date"` / `type="time"` (they follow the computer's locale).

## French typography

- A **narrow no-break space** (U+202F, ` `) before `;` `:` `?` `!` and `%`,
  and inside guillemets: `« Présélection »`. (A no-break space U+00A0 is
  accepted by the lint.) Never a plain space (the line may break before
  the sign), never none.
- Guillemets « », not straight quotes `"…"`.
- The typographic apostrophe `’`, the ellipsis `…` (not `...`).
- Numbers: `1 540,50 €` (narrow no-break space for thousands, comma for
  decimals, the sign after).
- Title case is English only: "Nouvelle réservation", not "Nouvelle
  Réservation".

## Quoting another product

A tool sometimes tells people where to click in *another* product ("In
Google Calendar, open « Paramètres »"). Those words are the other
product's, as it shows them: they are quoted as they are, in guillemets
(“…” in English), and never "corrected" to the glossary. The escape is
explicit, beside the catalogue — the words are listed once in
`lib/i18n/fr.ts` (or `en.ts`):

```ts
// Another product's interface, quoted as it shows it (lab/GLOSSARY.md).
export const quotedUi = ["Paramètres", "Supprimer l’agenda"];
export const fr = { … help: "Dans Google Agenda, ouvrez « Paramètres » puis « Supprimer l’agenda ». …" };
```

The lint then leaves a listed text alone **inside guillemets only**: the
same word elsewhere (the tool's own "Paramètres") is still an error, the
typography rules still apply to the quote (narrow spaces inside « »), and
a listed text that is never quoted is a warning (`quoted-ui`). The tool's
own words for the same idea stay the glossary's (« Réglages »).

## What the lint checks

| Rule | Level | What |
|---|---|---|
| `undo` | error | an English "Undo" whose French is not « Annuler l’action » |
| `undo-restore` | error | « Rétablir » for an English text with "undo" |
| `cancel-undo` | error | an English "Cancel" whose French is « Annuler l’action » |
| `verb` | error | Remove/Delete/Erase translated by another family's verb (Retirer/Supprimer/Effacer) |
| `settings` | error | « Paramètres » (Settings is « Réglages ») |
| `fr-space` | error | a plain space, or none, before `; : ? !` or inside « » |
| `clock` | error | AM/PM or mm/dd/yyyy in English |
| `assign` | warning | « Assigner » (prefer « Attribuer ») |
| `are-you-sure` | warning | "Are you sure" / « Êtes-vous sûr » (prefer Undo) |
| `quotes` | warning | straight double quotes in French |
| `ellipsis` | warning | `...` instead of `…` |
| `apostrophe` | warning | a straight apostrophe `'` in French |
| `quoted-ui` | warning | a `quotedUi` entry never quoted in guillemets (a stale escape) |

The word rules (`undo`, `verb`, `settings`, `assign`, `are-you-sure`…)
skip another product's words quoted in guillemets when the catalogue
lists them in `quotedUi` (above).
