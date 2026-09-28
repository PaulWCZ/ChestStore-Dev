// What the kit tells a person about their brand: short sentences, in the
// tools' languages (English first, French second), with the colour named
// in words ("your blue"), never a code a person cannot read. Adding a
// language is one more entry per message.
import { colourWord } from "./color.js";

export type Note = { code: NoteCode; en: string; fr: string };

const nbsp = " ";
const messages = {
  accent_darkened: { en: "Your {colour} was darkened a little so the white text on buttons is easy to read.", fr: "Votre {colour} a été un peu foncé pour que le texte blanc des boutons se lise facilement." },
  accent_dark_text: { en: "Buttons in your {colour} carry dark text, so they are easy to read.", fr: "Les boutons en {colour} portent un texte foncé pour se lire facilement." },
  accent_edge: { en: "Buttons get a dark outline so they stand out on white.", fr: "Les boutons ont un contour foncé pour ressortir sur le blanc." },
  accent_text: { en: "Links use a deeper shade of your {colour} so they are readable on white.", fr: "Les liens utilisent une nuance plus soutenue de votre {colour} pour rester lisibles sur le blanc." },
  dark_lighter: { en: "In dark mode, your {colour} is lighter so it stays readable.", fr: "En mode sombre, votre {colour} est plus clair pour rester lisible." },
  primary_grey: { en: "Your main colour is a grey: buttons use it and everything else stays neutral.", fr: `Votre couleur principale est un gris${nbsp}: les boutons l’utilisent et le reste reste neutre.` },
  secondary_used: { en: "Your second colour ({colour}) is used for highlights and labels.", fr: "Votre deuxième couleur ({colour}) sert aux surlignages et aux étiquettes." },
  neutral_used: { en: "Greys take a hint of your {colour}.", fr: "Les gris prennent une nuance de votre {colour}." },
  accent_like_danger: { en: "Your {colour} is close to the red of errors: errors also show an icon and words, so they stay clear.", fr: `Votre {colour} ressemble au rouge des erreurs${nbsp}: les erreurs ont aussi une icône et des mots, elles restent claires.` },
  accent_like_ok: { en: "Your {colour} is close to the green of success: success also shows an icon and words, so it stays clear.", fr: `Votre {colour} ressemble au vert des réussites${nbsp}: elles ont aussi une icône et des mots, elles restent claires.` },
  font_unknown: { en: "We don’t have the font “{font}”: {fallback} is used instead. Upload its files to use it.", fr: `Nous n’avons pas la police «${nbsp}{font}${nbsp}»${nbsp}: {fallback} la remplace. Envoyez ses fichiers pour l’utiliser.` },
  font_found: { en: "{role}: {font}.", fr: `{role}${nbsp}: {font}.` },
  format: { en: "Read as {format}: {count} colours found.", fr: `Lu comme {format}${nbsp}: {count} couleurs trouvées.` },
  primary_named: { en: "Main colour: “{name}” ({colour}).", fr: `Couleur principale${nbsp}: «${nbsp}{name}${nbsp}» ({colour}).` },
  primary_guessed: { en: "No colour is named main or brand: we took the most vivid one, a {colour}. Change it if needed.", fr: `Aucune couleur ne s’appelle principale ou marque${nbsp}: nous avons pris la plus vive, un {colour}. Changez-la si besoin.` },
  secondary_named: { en: "Second colour: “{name}” ({colour}).", fr: `Deuxième couleur${nbsp}: «${nbsp}{name}${nbsp}» ({colour}).` },
  secondary_guessed: { en: "Second colour: the next most vivid, a {colour}.", fr: `Deuxième couleur${nbsp}: la suivante en vivacité, un {colour}.` },
  neutral_named: { en: "Grey tint: “{name}” ({colour}).", fr: `Teinte des gris${nbsp}: «${nbsp}{name}${nbsp}» ({colour}).` },
  corners_found: { en: "Corners: {corners}, from your radius of {radius}.", fr: `Coins${nbsp}: {corners}, d’après votre arrondi de {radius}.` },
  aliases_skipped: { en: "Values pointing to tokens that are not in the file were skipped ({count}).", fr: "Les valeurs renvoyant à des jetons absents du fichier ont été ignorées ({count})." },
  nothing_found: { en: "No colour was found in this file. Try a design tokens file (.json), a CSS file or a list of colours like #1d5b43.", fr: "Aucune couleur trouvée dans ce fichier. Essayez un fichier de design tokens (.json), un fichier CSS ou une liste de couleurs comme #1d5b43." },
  too_large: { en: "This file is too large (1 MB at most).", fr: "Ce fichier est trop volumineux (1 Mo au plus)." },
  not_json: { en: "This file looks like JSON but cannot be read: colours were looked for in its text.", fr: `Ce fichier ressemble à du JSON mais ne se lit pas${nbsp}: les couleurs ont été cherchées dans son texte.` },
} as const;

export type NoteCode = keyof typeof messages;

const words: Record<string, { en: string; fr: string }> = {
  display: { en: "Headings", fr: "Titres" },
  body: { en: "Text", fr: "Texte" },
  sharp: { en: "sharp", fr: "droits" },
  soft: { en: "soft", fr: "adoucis" },
  round: { en: "round", fr: "arrondis" },
  dtcg: { en: "design tokens (W3C format)", fr: "design tokens (format W3C)" },
  "tokens-studio": { en: "Tokens Studio (Figma)", fr: "Tokens Studio (Figma)" },
  css: { en: "a CSS file", fr: "un fichier CSS" },
  list: { en: "a list of colours", fr: "une liste de couleurs" },
};

// note writes a message in every language. Values named colour* are
// colours, written as words; role, corners and format are words of the
// kit; anything else is shown as given.
export function note(code: NoteCode, values: Record<string, string | number> = {}): Note {
  const out = { code } as Note;
  for (const locale of ["en", "fr"] as const) {
    out[locale] = messages[code][locale].replace(/\{(\w+)\}/gu, (_, key: string) => {
      const value = values[key];
      if (value === undefined) return "";
      if (key.startsWith("colour")) return colourWord(String(value), locale);
      if (["role", "corners", "format"].includes(key)) return words[String(value)]?.[locale] ?? String(value);
      return String(value);
    });
  }
  return out;
}

export const noteCodes = Object.keys(messages) as NoteCode[];
export const noteMessages: Readonly<Record<NoteCode, { en: string; fr: string }>> = messages;
