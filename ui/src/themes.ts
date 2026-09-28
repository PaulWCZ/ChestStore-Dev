// The theme catalogue: the seventeen identities of the store's tools, each
// one usable by any tool, plus "Chest" (the portal's own sheet, light only)
// and "High contrast". Values come from each tool's app/tokens.css
// (2026-09-28); where a tool's value did not meet the contract (mostly field
// borders under 3:1, which the tools' own pages did not ask), the value is
// left out here and derived — reports/04-themes-and-kit.md lists them.
import { defineTheme, type ThemeSource } from "./compose.js";
import type { Theme } from "./contract.js";
import type { FontSpec } from "./fonts.js";

const sources: ThemeSource[] = [
  {
    id: "workshop", tool: "tasks",
    name: { en: "Workshop", fr: "Atelier" },
    description: { en: "Bright and sturdy: warm paper, ink outlines, sun yellow, hard shadows.", fr: "Vif et solide : papier chaud, contours à l’encre, jaune soleil, ombres franches." },
    fonts: { display: "space-grotesk", body: "inter" },
    display: { weight: 700, tracking: "-0.01em" },
    radius: { s: 6, m: 10, l: 14 }, border: 2,
    motion: { ease: "cubic-bezier(0.2, 0.8, 0.2, 1)", slow: 220 },
    type: { xl: 1.75, xxl: 2.25 },
    light: { bg: "#fff8e7", surface: "#ffffff", "surface-2": "#fdf0cf", ink: "#151515", "ink-2": "#5b574e", line: "#e6dcc4", "line-strong": "#151515", accent: "#ffd84d", "accent-ink": "#151515", "accent-line": "#151515", "accent-soft": "#fff1bf", "accent-text": "#1f4bff", ok: "#1d7a3a", danger: "#c2290f", focus: "#1f4bff", overlay: "rgb(21 21 21 / 0.45)", "shadow-1": "3px 3px 0px #151515", "shadow-2": "5px 5px 0px #151515" },
    dark: { bg: "#161512", surface: "#201f1b", "surface-2": "#2b2923", ink: "#f4efe3", "ink-2": "#b9b2a3", line: "#3a372f", "line-strong": "#f4efe3", accent: "#ffd84d", "accent-ink": "#151515", "accent-soft": "#33301f", "accent-text": "#8fa8ff", ok: "#7bd98f", danger: "#ff8c73", focus: "#8fa8ff", overlay: "rgb(0 0 0 / 0.6)", "shadow-1": "3px 3px 0px #000000", "shadow-2": "5px 5px 0px #000000" },
    palette: {
      chroma: 1.25,
      // The board's labels: bright fills with ink on them.
      light: { 1: { soft: "#5bb4ff", ink: "#151515" }, 2: { soft: "#7bd05b", ink: "#151515" }, 3: { soft: "#ff7a59", ink: "#151515" }, 4: { soft: "#b9a3ff", ink: "#151515" }, 5: { soft: "#f266a8", ink: "#151515" }, 6: { soft: "#2fc6b5", ink: "#151515" }, 7: { soft: "#ffd84d", ink: "#151515" }, 8: { soft: "#c3cad2", ink: "#151515" } },
    },
  },
  {
    id: "library", tool: "wiki",
    name: { en: "Library", fr: "Bibliothèque" },
    description: { en: "Calm and literate: warm paper, a reading serif, one deep green.", fr: "Calme et lettré : papier chaud, un sérif de lecture, un vert profond." },
    fonts: { display: "newsreader", body: "source-sans-3", accent: "newsreader" },
    display: { weight: 600, tracking: "-0.01em" },
    type: { xs: 0.8125, s: 0.9375, m: 1.0625, l: 1.3125, xl: 1.75, xxl: 2.5 },
    radius: { s: 5, m: 8, l: 14 },
    light: { bg: "#faf6ee", surface: "#fffdf8", "surface-2": "#f3eee2", ink: "#23201a", "ink-2": "#5d574b", line: "#e2d9c7", accent: "#1d5b43", "accent-ink": "#ffffff", "accent-soft": "#e3ede5", danger: "#a93226", "danger-soft": "#f8e1dc", ok: "#1d6b3a", "ok-soft": "#e3f0e2", focus: "#1d5b43", highlight: "#f6e3a1", "shadow-1": "0px 1px 0px rgb(60 45 20 / 0.06)", "shadow-2": "0px 10px 30px rgb(60 45 20 / 0.14), 0px 2px 6px rgb(60 45 20 / 0.06)" },
    dark: { bg: "#16140f", surface: "#211e18", "surface-2": "#2a261e", ink: "#ece5d6", "ink-2": "#b3aa98", line: "#343026", accent: "#8fcfae", "accent-ink": "#0d2419", "accent-soft": "#22362b", danger: "#ff9b8a", "danger-soft": "#3d201b", ok: "#9fdcad", "ok-soft": "#1f3524", focus: "#8fcfae", highlight: "#5c4a14" },
    palette: {
      chroma: 0.8,
      // The spaces' spines.
      light: { 1: { solid: "#2d5b8a" }, 2: { solid: "#2f6e4f" }, 3: { solid: "#a2502c" }, 4: { solid: "#7a3f6b" }, 7: { solid: "#a0700f" }, 8: { solid: "#55616c" } },
      dark: { 1: { solid: "#7fa9d6" }, 2: { solid: "#74b793" }, 3: { solid: "#df8e68" }, 4: { solid: "#c690b8" }, 7: { solid: "#d9ad55" }, 8: { solid: "#9aa8b4" } },
    },
  },
  {
    id: "seaside", tool: "leave",
    name: { en: "Seaside", fr: "Bord de mer" },
    description: { en: "Soft and friendly: a pastel sky, peach and mint, big rounded cards.", fr: "Doux et accueillant : ciel pastel, pêche et menthe, grandes cartes arrondies." },
    fonts: { display: "nunito", body: "nunito-sans" },
    display: { weight: 800 },
    type: { xs: 0.8125, xxl: 2.75 },
    radius: { s: 10, m: 14, l: 20 },
    motion: { ease: "cubic-bezier(0.2, 0.8, 0.2, 1)", fast: 140, slow: 260 },
    light: { bg: "#f3f7fb", surface: "#ffffff", "surface-2": "#eaf1f8", ink: "#1d2b3a", "ink-2": "#4b5b6e", line: "#d7e2ee", accent: "#2366a8", "accent-ink": "#ffffff", "accent-soft": "#dcebfa", danger: "#b42318", "danger-soft": "#fde4e1", ok: "#1b7a4b", "ok-soft": "#d8f3e5", wait: "#7a5600", "wait-soft": "#fdf0c7", focus: "#2366a8", "shadow-1": "0px 1px 2px rgb(29 43 58 / 0.05), 0px 2px 8px rgb(29 43 58 / 0.05)", "shadow-2": "0px 12px 32px rgb(29 43 58 / 0.14)" },
    dark: { bg: "#0f1720", surface: "#17212c", "surface-2": "#1f2b38", ink: "#eaf1f8", "ink-2": "#a9b8c8", line: "#2c3a4a", accent: "#8cc4f5", "accent-ink": "#0b2540", "accent-soft": "#1d3550", danger: "#ff9b8f", "danger-soft": "#3d1c1a", ok: "#7fdcaa", "ok-soft": "#173a2a", wait: "#f5d77a", "wait-soft": "#3a3014", focus: "#8cc4f5" },
    palette: {
      // The leave kinds: a soft fill and the ink that reads on it.
      light: { 1: { soft: "#d6e9fb", ink: "#174a7c" }, 2: { soft: "#cff0e0", ink: "#125c3e" }, 3: { soft: "#ffe0cf", ink: "#8a3a10" }, 4: { soft: "#e6e0fb", ink: "#4a3a8f" }, 5: { soft: "#fbd9e3", ink: "#8c2346" }, 6: { soft: "#cdeff0", ink: "#0f5a5e" }, 7: { soft: "#fdefb8", ink: "#6e5200" }, 8: { soft: "#efe7da", ink: "#5b4b34" } },
      dark: { 1: { soft: "#1e3a56", ink: "#bfe0ff" }, 2: { soft: "#183f31", ink: "#b6f0d4" }, 3: { soft: "#4a2c1e", ink: "#ffd2ba" }, 4: { soft: "#2e2850", ink: "#d9d0ff" }, 5: { soft: "#45202e", ink: "#ffc7d8" }, 6: { soft: "#173e40", ink: "#b8eef0" }, 7: { soft: "#3f3413", ink: "#fbe7a1" }, 8: { soft: "#3a3228", ink: "#eadfcc" } },
    },
  },
  {
    id: "newsprint", tool: "news",
    name: { en: "Newsprint", fr: "Papier journal" },
    description: { en: "Editorial and warm: newsprint, black rules, a headline serif, press red.", fr: "Éditorial et chaleureux : papier journal, filets noirs, sérif de titre, rouge presse." },
    fonts: { display: "fraunces", body: "libre-franklin", accent: "fraunces" },
    display: { weight: 700, tracking: "-0.015em" },
    type: { l: 1.1875, xl: 1.625, xxl: 2.25 },
    radius: { s: 2, m: 4, l: 6 },
    light: { bg: "#f7f3ea", surface: "#fffdf8", ink: "#16130f", "ink-2": "#5c554b", line: "#d9d0bf", "line-strong": "#16130f", accent: "#c4121a", "accent-ink": "#ffffff", "accent-soft": "#f6ddd5", highlight: "#f2e3b8", ok: "#1d6b3a", focus: "#c4121a", "shadow-1": "0px 1px 0px rgb(22 19 15 / 0.08)", "shadow-2": "0px 10px 30px rgb(22 19 15 / 0.16)" },
    dark: { bg: "#121110", surface: "#1c1a17", ink: "#f3ede2", "ink-2": "#b8ae9e", line: "#3a352e", "line-strong": "#f3ede2", accent: "#ff6f61", "accent-ink": "#16130f", "accent-soft": "#3a1f1b", highlight: "#3b331c", ok: "#6fcf8f", focus: "#ff6f61" },
    palette: { chroma: 0.9 },
  },
  {
    id: "gallery", tool: "people",
    name: { en: "Portrait gallery", fr: "Galerie de portraits" },
    description: { en: "Warm and welcoming: cream walls, terracotta, deep plum ink.", fr: "Chaleureux et accueillant : murs crème, terre cuite, encre prune." },
    fonts: { display: "outfit", body: "outfit" },
    display: { weight: 600, tracking: "-0.01em" },
    type: { xs: 0.8125, s: 0.9375, m: 1.0625, l: 1.3125, xl: 1.875, xxl: 2.5 },
    radius: { s: 10, m: 14, l: 24 },
    motion: { fast: 140, slow: 260 },
    light: { bg: "#fbf5ec", surface: "#fffdf9", "surface-2": "#f4ebdf", ink: "#3a1f3d", "ink-2": "#6b5169", line: "#eadfd0", accent: "#b4472a", "accent-ink": "#ffffff", "accent-text": "#a3401f", "accent-soft": "#f7e3d6", danger: "#b3261e", ok: "#2f6b4a", "ok-soft": "#dcebdf", focus: "#b4472a", "shadow-1": "0px 1px 2px rgb(58 31 61 / 0.06), 0px 2px 8px rgb(58 31 61 / 0.04)", "shadow-2": "0px 12px 32px rgb(58 31 61 / 0.14)" },
    dark: { bg: "#1d1420", surface: "#281c2c", "surface-2": "#332537", ink: "#f6ede4", "ink-2": "#cbb8c8", line: "#3f2f43", accent: "#f08e6a", "accent-ink": "#2a1410", "accent-text": "#f08e6a", "accent-soft": "#432a2b", danger: "#ff9a8a", ok: "#7fc79c", "ok-soft": "#22382b", focus: "#f08e6a" },
    palette: {
      chroma: 0.85,
      // The arches behind portraits.
      light: { 2: { soft: "#d8e5d0" }, 3: { soft: "#f3d9c9" }, 4: { soft: "#e6d6e6" }, 5: { soft: "#f4d4d9" }, 6: { soft: "#d3e3e6" }, 7: { soft: "#f1e2b8" } },
      dark: { 2: { soft: "#2f4632" }, 3: { soft: "#5a3226" }, 4: { soft: "#4a3350" }, 5: { soft: "#56303a" }, 6: { soft: "#28444a" }, 7: { soft: "#54452a" } },
    },
  },
  {
    id: "sales-desk", tool: "crm",
    name: { en: "Sales desk", fr: "Bureau des ventes" },
    description: { en: "Dense and precise: cool slate, one electric blue, figures in a monospace.", fr: "Dense et précis : ardoise froide, un bleu électrique, chiffres en chasse fixe." },
    fonts: { display: "ibm-plex-sans", body: "ibm-plex-sans", mono: "ibm-plex-mono" },
    display: { weight: 600 },
    type: { xs: 0.75, s: 0.8125, m: 0.9375, l: 1.125, xl: 1.5, xxl: 2 },
    radius: { s: 3, m: 6, l: 10 },
    light: { bg: "#f4f6f9", surface: "#ffffff", "surface-2": "#eef1f5", ink: "#0f1722", "ink-2": "#3b4656", line: "#d5dbe3", accent: "#2152ff", "accent-ink": "#ffffff", "accent-soft": "#e6ecff", "accent-text": "#1a3fe0", ok: "#0f7a3d", "ok-soft": "#e3f5ea", danger: "#c4231c", "danger-soft": "#fde8e7", wait: "#9a5200", "wait-soft": "#fff1db", overlay: "rgb(11 15 21 / 0.45)", "shadow-1": "0px 1px 0px rgb(15 23 34 / 0.06), 0px 1px 2px rgb(15 23 34 / 0.06)", "shadow-2": "0px 8px 24px rgb(15 23 34 / 0.14), 0px 2px 6px rgb(15 23 34 / 0.08)" },
    dark: { bg: "#0b0f15", surface: "#121821", "surface-2": "#19212c", ink: "#e6ebf2", "ink-2": "#b3bdca", line: "#263140", accent: "#6f8cff", "accent-ink": "#0b0f15", "accent-soft": "#19213a", "accent-text": "#9db0ff", ok: "#4ade80", "ok-soft": "#0f2a1a", danger: "#ff7b72", "danger-soft": "#2d1414", wait: "#f0b35a", "wait-soft": "#2a1f0d", "shadow-1": "0px 1px 0px rgb(0 0 0 / 0.4)", "shadow-2": "0px 10px 30px rgb(0 0 0 / 0.55)" },
    palette: { chroma: 1.05 },
  },
  {
    id: "receipt", tool: "expenses",
    name: { en: "Receipt", fr: "Ticket de caisse" },
    description: { en: "Precise and honest: thermal paper, ink black, money green, till-roll figures.", fr: "Précis et honnête : papier thermique, noir d’encre, vert argent, chiffres de caisse." },
    fonts: { display: "public-sans", body: "public-sans", mono: "jetbrains-mono" },
    display: { weight: 700, tracking: "-0.01em" },
    type: { xxl: 2.75 },
    radius: { s: 4, m: 8, l: 12 },
    motion: { slow: 220 },
    light: { bg: "#f5f2ea", surface: "#fffdf7", "surface-2": "#ebe7dc", ink: "#1a1a17", "ink-2": "#5b574c", line: "#d8d2c3", accent: "#0b7a43", "accent-ink": "#ffffff", "accent-soft": "#e2f2e7", ok: "#0b7a43", "ok-soft": "#e2f2e7", danger: "#b3261e", "danger-soft": "#fbe5e1", wait: "#8e3b00", "wait-soft": "#fff1d6", focus: "#2e3a8c", "shadow-1": "0px 1px 0px rgb(26 26 23 / 0.06), 0px 1px 3px rgb(26 26 23 / 0.08)", "shadow-2": "0px 2px 0px rgb(26 26 23 / 0.06), 0px 10px 28px rgb(26 26 23 / 0.14)" },
    dark: { bg: "#131412", surface: "#1c1d1a", "surface-2": "#252622", ink: "#ece8dc", "ink-2": "#a8a393", line: "#34352f", accent: "#4cc983", "accent-ink": "#131412", "accent-soft": "#142219", ok: "#4cc983", "ok-soft": "#142219", danger: "#ff7a70", "danger-soft": "#2a1716", wait: "#f3c76b", "wait-soft": "#2b2618", focus: "#9fb1ff", "shadow-1": "0px 1px 0px rgb(0 0 0 / 0.3)", "shadow-2": "0px 10px 30px rgb(0 0 0 / 0.5)" },
    palette: { chroma: 0.85 },
  },
  {
    id: "counter", tool: "helpdesk",
    name: { en: "Calm counter", fr: "Comptoir calme" },
    description: { en: "Calm and legible: mint-white paper, deep teal, coral warmth, a typeface made for everyone.", fr: "Calme et lisible : papier blanc menthe, sarcelle profond, chaleur corail, une police faite pour tous." },
    fonts: { display: "atkinson-hyperlegible", body: "atkinson-hyperlegible" },
    display: { weight: 700 },
    type: { xs: 0.8125, s: 0.9, m: 1.0625, l: 1.3, xl: 1.75, xxl: 2.25 },
    radius: { s: 8, m: 14, l: 22 },
    motion: { ease: "cubic-bezier(0.2, 0.8, 0.2, 1)", slow: 220 },
    light: { bg: "#f3f7f6", surface: "#ffffff", "surface-2": "#e8f1ef", ink: "#12302f", "ink-2": "#4a6361", line: "#d3e2df", accent: "#0b6e69", "accent-ink": "#ffffff", "accent-soft": "#ddefec", danger: "#b3261e", focus: "#0b6e69", highlight: "#fff1b8", overlay: "rgb(18 48 47 / 0.4)", "shadow-1": "0px 1px 2px rgb(18 48 47 / 0.06), 0px 4px 16px rgb(18 48 47 / 0.06)", "shadow-2": "0px 10px 30px rgb(18 48 47 / 0.14)" },
    dark: { bg: "#0f1c1c", surface: "#172726", "surface-2": "#1e3a37", ink: "#e6f2f0", "ink-2": "#a7c1be", line: "#2b4744", accent: "#5fd3c8", "accent-ink": "#0f1c1c", "accent-soft": "#1e3a37", danger: "#ff9a85", focus: "#5fd3c8", highlight: "#2f2a14", "shadow-1": "none" },
    palette: {
      // The customer's coral and the team's butter notes.
      light: { 3: { soft: "#ffd9cf" }, 7: { soft: "#fff1b8" } },
      dark: { 3: { soft: "#3b2a26" }, 7: { soft: "#2f2a14" } },
    },
  },
  {
    id: "blueprint", tool: "rooms",
    name: { en: "Blueprint", fr: "Plan d’architecte" },
    description: { en: "Calm and precise: drafting paper, navy ink, thin lines, one signal orange.", fr: "Calme et précis : papier à dessin, encre marine, traits fins, un orange signal." },
    fonts: { display: "albert-sans", body: "albert-sans", mono: "dm-mono" },
    display: { weight: 700, tracking: "-0.01em" },
    type: { xl: 1.625, xxl: 2.125 },
    radius: { s: 4, m: 6, l: 10 },
    motion: { ease: "cubic-bezier(0.2, 0.8, 0.2, 1)", slow: 220 },
    light: { bg: "#f3f7fc", surface: "#ffffff", "surface-2": "#e8f0f9", ink: "#0f2447", "ink-2": "#4a5d7e", line: "#c3d3e8", "line-strong": "#0f2447", accent: "#0f2447", "accent-ink": "#ffffff", "accent-soft": "#e8f0f9", "accent-text": "#1f5fbf", danger: "#b3261e", focus: "#1f5fbf", overlay: "rgb(15 36 71 / 0.4)", "shadow-1": "0px 1px 0px rgb(15 36 71 / 0.06)", "shadow-2": "0px 1px 0px rgb(15 36 71 / 0.06), 0px 8px 24px -12px rgb(15 36 71 / 0.25)" },
    dark: { bg: "#0b1a30", surface: "#102440", "surface-2": "#16304f", ink: "#e8f0fb", "ink-2": "#a9bcd8", line: "#2b4668", "line-strong": "#e8f0fb", accent: "#e8f0fb", "accent-ink": "#0b1a30", "accent-soft": "#16304f", "accent-text": "#8cb8ff", danger: "#ff8a80", focus: "#8cb8ff", "shadow-1": "0px 1px 0px rgb(0 0 0 / 0.3)", "shadow-2": "0px 1px 0px rgb(0 0 0 / 0.3), 0px 8px 24px -12px rgb(0 0 0 / 0.6)" },
    palette: {
      chroma: 0.9,
      // Signal orange: yours, or taken.
      light: { 3: { solid: "#c2410c", soft: "#fdebe0", ink: "#b93d0b" } },
      dark: { 3: { solid: "#ff8a4c", soft: "#3a2a26", ink: "#ff8a4c" } },
    },
  },
  {
    id: "instrument", tool: "timesheets",
    name: { en: "Instrument", fr: "Instrument" },
    description: { en: "Precise and luminous: ink green, cool paper, an electric lime signal, tabular figures.", fr: "Précis et lumineux : vert encre, papier froid, un signal vert citron, chiffres tabulaires." },
    fonts: { display: "manrope", body: "manrope", mono: "martian-mono" },
    display: { weight: 700, tracking: "-0.01em" },
    radius: { s: 4, m: 8, l: 12 },
    light: { bg: "#eef1ec", surface: "#ffffff", "surface-2": "#e3e9e3", ink: "#0d1f19", "ink-2": "#4a5d55", line: "#cfd8d1", "line-strong": "#7a8e84", accent: "#0f5b43", "accent-ink": "#ffffff", "accent-soft": "#dcebe2", danger: "#b42318", "danger-soft": "#fbe3e0", wait: "#8a5a00", "wait-soft": "#fbefd5", focus: "#0f5b43", highlight: "#e4f9b0", "shadow-1": "0px 1px 0px rgb(13 31 25 / 0.06)", "shadow-2": "0px 12px 32px rgb(13 31 25 / 0.18)" },
    dark: { bg: "#08130f", surface: "#0e1c17", "surface-2": "#142820", ink: "#e3eee8", "ink-2": "#9db3a8", line: "#213a30", "line-strong": "#4e6d5f", accent: "#8fe3bd", "accent-ink": "#06201a", "accent-soft": "#163a2d", danger: "#ff8f84", "danger-soft": "#3a1714", wait: "#f3c46b", "wait-soft": "#2f2410", focus: "#c6ff3a", highlight: "#2c3d10" },
    palette: {
      // The project colours.
      light: { 1: { solid: "#2477c4" }, 2: { solid: "#5f7f12" }, 3: { solid: "#d9542c" }, 4: { solid: "#8646c2" }, 5: { solid: "#c7356f" }, 6: { solid: "#0d8a79" }, 7: { solid: "#b87b00" } },
      dark: { 1: { solid: "#62a9ec" }, 2: { solid: "#a3c451" }, 3: { solid: "#f58c69" }, 4: { solid: "#b88ae8" }, 5: { solid: "#ee7aa8" }, 6: { solid: "#3cc3ae" }, 7: { solid: "#e7b33e" } },
    },
  },
  {
    id: "appointment", tool: "booking",
    name: { en: "Appointment card", fr: "Carte de rendez-vous" },
    description: { en: "Polite and warm: paper, plum ink, mint for what is free, apricot for today.", fr: "Poli et chaleureux : papier, encre prune, menthe pour le libre, abricot pour aujourd’hui." },
    fonts: { display: "young-serif", body: "figtree", accent: "young-serif" },
    display: { weight: 400 },
    type: { xxl: 2.4 },
    radius: { s: 8, m: 14, l: 22 },
    light: { bg: "#fbf7f1", surface: "#ffffff", "surface-2": "#f4ede3", ink: "#24172e", "ink-2": "#5f5268", line: "#e4d9cc", accent: "#5b2a86", "accent-ink": "#ffffff", "accent-soft": "#f0e7f8", ok: "#0b6e55", "ok-soft": "#ddf2ea", wait: "#974503", "wait-soft": "#fde9d6", danger: "#b3261e", "danger-soft": "#fbe4e2", focus: "#5b2a86", "shadow-1": "0px 1px 2px rgb(36 23 46 / 0.06), 0px 2px 6px rgb(36 23 46 / 0.04)", "shadow-2": "0px 12px 32px rgb(36 23 46 / 0.14)" },
    dark: { bg: "#17121b", surface: "#211a27", "surface-2": "#2b2332", ink: "#f4eef8", "ink-2": "#bcaec6", line: "#3b3144", accent: "#cfaef2", "accent-ink": "#22122f", "accent-soft": "#37284a", ok: "#7fdcbc", "ok-soft": "#173a30", wait: "#f5b271", "wait-soft": "#43301c", danger: "#ff8a80", "danger-soft": "#45201e", focus: "#cfaef2" },
    palette: {
      // The booking types' swatches and tints.
      light: { 1: { solid: "#2f6fd0", soft: "#e2ecfb" }, 2: { solid: "#3b7d23", soft: "#e4f2dc" }, 3: { solid: "#c23b22", soft: "#fbe3dd" }, 4: { solid: "#6b3fb5", soft: "#ece4f8" }, 5: { solid: "#b0296a", soft: "#f9e0ec" }, 6: { solid: "#0f7c8c", soft: "#dcf1f3" }, 7: { solid: "#a86a00", soft: "#fbefd2" }, 8: { solid: "#4d5b6a", soft: "#e6eaee" } },
      dark: { 1: { solid: "#8db6f5", soft: "#1f2d44" }, 2: { solid: "#9bd87f", soft: "#22341b" }, 3: { solid: "#ff9a85", soft: "#45231c" }, 4: { solid: "#c3a4f5", soft: "#312546" }, 5: { solid: "#f58cbd", soft: "#43202f" }, 6: { solid: "#6fd0dc", soft: "#173539" }, 7: { solid: "#f0c15c", soft: "#3a2f14" }, 8: { solid: "#b3c0cd", soft: "#2a3038" } },
    },
  },
  {
    id: "magazine", tool: "hiring",
    name: { en: "Magazine", fr: "Magazine" },
    description: { en: "Confident and editorial: cream paper, deep cobalt, a tomato accent, big characterful words.", fr: "Assuré et éditorial : papier crème, cobalt profond, touche tomate, grands mots de caractère." },
    fonts: { display: "bricolage-grotesque", body: "instrument-sans" },
    display: { weight: 700, tracking: "-0.02em" },
    type: { xs: 0.8125, l: 1.1875, xl: 1.625, xxl: 2.75 },
    radius: { s: 6, m: 10, l: 18 },
    light: { bg: "#f6f0e4", surface: "#fffaf1", "surface-2": "#efe6d4", ink: "#1a1a2e", "ink-2": "#5b5a6e", line: "#e2d7c1", "line-strong": "#8d8474", accent: "#1c2b8f", "accent-ink": "#f6f0e4", "accent-soft": "#e4e7fb", ok: "#1d6b43", "ok-soft": "#dcefe2", danger: "#b0281a", focus: "#1c2b8f", "shadow-1": "0px 1px 0px rgb(26 26 46 / 0.06), 0px 1px 3px rgb(26 26 46 / 0.06)", "shadow-2": "0px 12px 32px rgb(26 26 46 / 0.16)" },
    dark: { bg: "#10133a", surface: "#181c4a", "surface-2": "#141840", ink: "#f6f0e4", "ink-2": "#a9a8bf", line: "#2a2f66", "line-strong": "#6d72a8", accent: "#9fb0ff", "accent-ink": "#10133a", "accent-soft": "#252b6b", ok: "#7fd6a2", "ok-soft": "#173a36", danger: "#ff9a8a", focus: "#ffcf70" },
    palette: {
      // Tomato: kickers, "new", the index numbers.
      light: { 3: { solid: "#c93a1e", soft: "#fde3da", ink: "#7a2410" } },
      dark: { 3: { solid: "#ff8a6b", soft: "#3d1f33", ink: "#ffc2b1" } },
    },
  },
  {
    id: "labels", tool: "equipment",
    name: { en: "Tool crib", fr: "Magasin d’outillage" },
    description: { en: "Sturdy and orderly: steel shelves, utility orange tags, printed labels.", fr: "Solide et rangé : étagères d’acier, étiquettes orange, marquages imprimés." },
    fonts: { display: "ibm-plex-sans", body: "ibm-plex-sans", mono: "ibm-plex-mono" },
    display: { weight: 700 },
    radius: { s: 4, m: 6, l: 10 },
    light: { bg: "#f4f2ee", surface: "#ffffff", "surface-2": "#eceae4", ink: "#1b1f22", "ink-2": "#56606a", line: "#d9d5cc", "line-strong": "#1b1f22", accent: "#c2410c", "accent-ink": "#ffffff", "accent-soft": "#fde6d6", focus: "#1f6fb2", danger: "#b3261e", "danger-soft": "#fbe3e1", ok: "#1e7a45", "ok-soft": "#e1f2e7", wait: "#9a4a00", "wait-soft": "#fdebd8", "shadow-1": "0px 1px 0px rgb(27 31 34 / 0.08)", "shadow-2": "0px 12px 32px rgb(20 25 30 / 0.22)" },
    dark: { bg: "#14181b", surface: "#1d2226", "surface-2": "#262c31", ink: "#eef1f3", "ink-2": "#a9b4bd", line: "#353d44", "line-strong": "#8c99a4", accent: "#ff8a4c", "accent-ink": "#1b1f22", "accent-soft": "#3a2a20", focus: "#8cc2f0", danger: "#ff9b93", "danger-soft": "#3b2020", ok: "#7fd6a0", "ok-soft": "#1f3328", wait: "#ffb37a", "wait-soft": "#3a2a1c" },
    palette: {
      // The statuses' tags: in use (blue), retired (steel).
      light: { 1: { solid: "#245a86", soft: "#e0ebf5" }, 8: { solid: "#5b636a", soft: "#e9e9e7" } },
      dark: { 1: { solid: "#8cc2f0", soft: "#1e2d3b" }, 8: { solid: "#b7bfc6", soft: "#2b3035" } },
    },
  },
  {
    id: "confetti", tool: "polls",
    name: { en: "Confetti", fr: "Confettis" },
    description: { en: "Playful and quick: coral, deep navy and mint on warm paper, chunky rounded shapes.", fr: "Joueur et rapide : corail, marine profond et menthe sur papier chaud, formes rondes et dodues." },
    fonts: { display: "fredoka", body: "plus-jakarta-sans" },
    display: { weight: 600 },
    type: { xs: 0.8125, xl: 1.625, xxl: 2.5 },
    radius: { s: 10, m: 16, l: 24 },
    motion: { ease: "cubic-bezier(0.2, 0.8, 0.2, 1)", fast: 140, slow: 320 },
    light: { bg: "#fff7ef", surface: "#ffffff", "surface-2": "#fff0e4", ink: "#1b2440", "ink-2": "#4a5270", line: "#ecdccf", "line-strong": "#1b2440", accent: "#ff7a63", "accent-ink": "#1b2440", "accent-line": "#d9533d", "accent-text": "#b8321f", "accent-soft": "#ffe2da", ok: "#0b6b4f", "ok-soft": "#d8f7ec", wait: "#7a5300", "wait-soft": "#fff1c7", danger: "#b3261e", focus: "#2f55e0", "shadow-1": "0px 1px 0px rgb(27 36 64 / 0.04), 0px 8px 24px -12px rgb(27 36 64 / 0.18)" },
    dark: { bg: "#111829", surface: "#1a2338", "surface-2": "#222d47", ink: "#f4eee8", "ink-2": "#b7bcd0", line: "#2e3a57", accent: "#ff8a76", "accent-ink": "#111829", "accent-soft": "#3a2530", "accent-text": "#ff8a76", ok: "#7ff0c9", "ok-soft": "#173a36", wait: "#ffd98a", "wait-soft": "#3a3222", danger: "#ff8a80", focus: "#9db4ff", "shadow-1": "0px 1px 0px rgb(0 0 0 / 0.2), 0px 10px 28px -14px rgb(0 0 0 / 0.6)" },
    palette: { chroma: 1.25, hues: { 6: 175 } },
  },
  {
    id: "trail", tool: "goals",
    name: { en: "Trail map", fr: "Carte de randonnée" },
    description: { en: "Calm and outdoorsy: sand paper, deep forest ink, a sunrise orange for progress.", fr: "Calme et de plein air : papier sable, encre forêt, un orange lever de soleil pour les progrès." },
    fonts: { display: "barlow-semi-condensed", body: "work-sans" },
    display: { weight: 600, tracking: "0.01em" },
    type: { xs: 0.8125 },
    radius: { s: 6, m: 10, l: 14 },
    motion: { slow: 260 },
    light: { bg: "#f3eee2", surface: "#fbf9f3", "surface-2": "#e8e0cf", ink: "#17302a", "ink-2": "#4c5f58", line: "#d6ccb8", accent: "#1f4a3f", "accent-ink": "#f7f3e8", ok: "#2e6b45", "ok-soft": "#e0eee3", wait: "#8a5a00", "wait-soft": "#f6e8c8", danger: "#a8321f", "danger-soft": "#f7ddd6", focus: "#bf4f1d", highlight: "#f6dfcd", "shadow-1": "0px 1px 2px rgb(23 48 42 / 0.07), 0px 2px 6px rgb(23 48 42 / 0.05)", "shadow-2": "0px 10px 30px rgb(23 48 42 / 0.18)" },
    dark: { bg: "#0f1715", surface: "#16211e", "surface-2": "#26332f", ink: "#efe8d8", "ink-2": "#a7b3ac", line: "#2d3b37", accent: "#e6dcc4", "accent-ink": "#16211e", ok: "#6fc48e", "ok-soft": "#183124", wait: "#e2b04a", "wait-soft": "#33290f", danger: "#f0806a", "danger-soft": "#3a1c16", focus: "#f08a4b", highlight: "#3a2519" },
    palette: {
      chroma: 0.85,
      // Sunrise: progress and the check-in.
      light: { 3: { solid: "#bf4f1d", soft: "#f6dfcd" } },
      dark: { 3: { solid: "#f08a4b", soft: "#3a2519" } },
    },
  },
  {
    id: "letterpress", tool: "quotes",
    name: { en: "Letterpress", fr: "Typographie" },
    description: { en: "Exact and formal: crisp paper on a quiet desk, blue-black ink, an oxblood seal, a Caslon.", fr: "Exact et formel : papier net sur un bureau calme, encre bleu-noir, un sceau bordeaux, une Caslon." },
    fonts: { display: "libre-caslon-text", body: "hanken-grotesk", accent: "libre-caslon-text" },
    display: { weight: 400 },
    type: { xl: 1.875, xxl: 2.5 },
    radius: { s: 3, m: 6, l: 10 },
    light: { bg: "#f3f1ec", surface: "#ffffff", "surface-2": "#f7f5f1", ink: "#161b2e", "ink-2": "#4f5468", line: "#dcd8cf", "line-strong": "#8e8a80", accent: "#8a1f30", "accent-ink": "#ffffff", "accent-soft": "#f7e8ea", ok: "#1c6a47", "ok-soft": "#e6f1ea", focus: "#2346a8", "shadow-1": "0px 1px 2px rgb(22 27 46 / 0.1)", "shadow-2": "0px 10px 30px rgb(22 27 46 / 0.18)" },
    dark: { bg: "#12151f", surface: "#1a1e2b", "surface-2": "#222736", ink: "#e8e4db", "ink-2": "#a9adbd", line: "#333a4d", "line-strong": "#6b7186", accent: "#f08f9c", "accent-ink": "#1a0d10", "accent-soft": "#2a1c22", ok: "#7fd1a6", "ok-soft": "#16271f", focus: "#8fb3ff", "shadow-1": "0px 1px 2px rgb(0 0 0 / 0.4)", "shadow-2": "0px 10px 30px rgb(0 0 0 / 0.5)" },
    palette: { chroma: 0.75 },
  },
  {
    id: "control-room", tool: "status",
    name: { en: "Control room", fr: "Salle de contrôle" },
    description: { en: "Calm and exact: cool grey, near-black ink, state colours that never go alone.", fr: "Calme et exact : gris froid, encre presque noire, des couleurs d’état jamais seules." },
    fonts: { display: "red-hat-text", body: "red-hat-text", mono: "red-hat-mono" },
    display: { weight: 700 },
    type: { xl: 1.625, xxl: 2.125 },
    radius: { s: 4, m: 6, l: 10 },
    motion: { slow: 220 },
    light: { bg: "#eef1f4", surface: "#ffffff", "surface-2": "#e3e8ed", ink: "#0f1419", "ink-2": "#4a5561", line: "#d3dae1", accent: "#0f1419", "accent-ink": "#ffffff", "accent-soft": "#d8e4f3", "accent-text": "#0b5cad", focus: "#1f66c7", ok: "#0a6b4a", "ok-soft": "#e3f4ec", wait: "#7d5800", "wait-soft": "#fbf3dc", danger: "#b3261e", "danger-soft": "#fde8e4", "danger-ink": "#a8260f", "shadow-1": "0px 1px 0px rgb(15 20 25 / 0.04), 0px 1px 3px rgb(15 20 25 / 0.06)", "shadow-2": "0px 8px 24px rgb(15 20 25 / 0.16)" },
    dark: { bg: "#0c1015", surface: "#141a21", "surface-2": "#1c232c", ink: "#e7ecf1", "ink-2": "#9aa7b4", line: "#26303b", accent: "#e7ecf1", "accent-ink": "#0f1419", "accent-soft": "#1f3552", "accent-text": "#7cb4ff", focus: "#7cb4ff", ok: "#5fd3a2", "ok-soft": "#10261d", wait: "#eac767", "wait-soft": "#2a2210", danger: "#f2665a", "danger-soft": "#2e1412", "danger-ink": "#f78b81", "shadow-1": "0px 1px 0px rgb(0 0 0 / 0.3)", "shadow-2": "0px 8px 24px rgb(0 0 0 / 0.5)" },
    palette: {
      // The Okabe–Ito states, as categories.
      light: { 1: { solid: "#1f66c7", soft: "#e2ecfa", ink: "#1a55a6" }, 2: { solid: "#0a7f58", soft: "#e3f4ec", ink: "#0a6b4a" }, 3: { solid: "#c95a0a", soft: "#fdeee3", ink: "#a54808" }, 5: { solid: "#c42d17", soft: "#fde8e4", ink: "#a8260f" }, 7: { solid: "#a87700", soft: "#fbf3dc", ink: "#7d5800" } },
      dark: { 1: { solid: "#5b9cf0", soft: "#111f33", ink: "#8bbaf6" }, 2: { solid: "#3fbf8a", soft: "#10261d", ink: "#5fd3a2" }, 3: { solid: "#f08a3c", soft: "#2d1b0f", ink: "#f6a769" }, 5: { solid: "#f2665a", soft: "#2e1412", ink: "#f78b81" }, 7: { solid: "#e0b33a", soft: "#2a2210", ink: "#eac767" } },
    },
  },
  {
    // The portal's own sheet, as the owner asked: an option for a company,
    // never a tool's identity (brief/05). The Suisse fonts are not the
    // studio's to ship: the families are declared so a Chest that holds
    // them serves them, and pages render with the fallbacks otherwise.
    id: "chest",
    name: { en: "Chest", fr: "Chest" },
    description: { en: "The portal’s own look: black and white, editorial, Swiss. Light only.", fr: "Le style du portail : noir et blanc, éditorial, suisse. Clair uniquement." },
    fonts: {
      display: { family: "Suisse", stack: "'Suisse', Arial, sans-serif" },
      body: { family: "Suisse", stack: "'Suisse', Arial, sans-serif" },
      accent: { family: "Works", stack: "'Works', Georgia, serif" },
    },
    display: { weight: 400, tracking: "-0.04em" },
    strong: 400,
    synthesis: false,
    modes: "light",
    type: { xs: 0.6875, s: 0.8125, m: 0.9375, l: 1.0625, xl: 1.625, xxl: 2.25, leading: 1.45 },
    radius: { s: 0, m: 0, l: 0 },
    motion: { ease: "cubic-bezier(0.4, 0, 0.2, 1)", fast: 150, slow: 150 },
    light: {
      bg: "#fafaf9", surface: "#ffffff", "surface-2": "#f1f1ed", ink: "#171716", "ink-2": "#6a6a66", line: "#deded8",
      // The sheet's field border (#bfbfb7) is 1.8:1 on white; WCAG 1.4.11
      // asks 3:1 for what identifies a field: its hover grey, #92928b, is
      // not enough either (3.1:1 on white, 3.0:1 on the page): one step darker.
      "line-strong": "#8a8a83",
      accent: "#171716", "accent-ink": "#ffffff", "accent-line": "#171716", "accent-soft": "#f1f1ed", "accent-text": "#171716",
      // No colour for states: a shape and a word say them (a filled square
      // for OK, an outlined one for waiting); brick for errors only.
      ok: "#171716", "ok-soft": "#f0f0eb", "ok-ink": "#171716",
      wait: "#6a6a66", "wait-soft": "#eaeae4", "wait-ink": "#171716",
      danger: "#8a3028", "danger-soft": "#f1f1ed", "danger-ink": "#8a3028",
      focus: "#0061fe", highlight: "#eaeae4",
      overlay: "rgb(23 23 22 / 0.55)", "shadow-1": "none", "shadow-2": "0px 8px 24px rgb(23 23 22 / 0.12)",
    },
    palette: {
      // Warm greys: categories are told by their label (which every tool
      // shows anyway), never by colour in this theme.
      light: {
        1: { solid: "#171716", soft: "#f0f0eb", ink: "#171716" }, 2: { solid: "#3a3a37", soft: "#eaeae4", ink: "#171716" },
        3: { solid: "#55554f", soft: "#e8e8e1", ink: "#171716" }, 4: { solid: "#6a6a66", soft: "#f1f1ed", ink: "#171716" },
        5: { solid: "#7a7a74", soft: "#e4e4dd", ink: "#171716" }, 6: { solid: "#2b2b29", soft: "#edede7", ink: "#171716" },
        7: { solid: "#4a4a45", soft: "#e6e6df", ink: "#171716" }, 8: { solid: "#86867f", soft: "#f3f3ef", ink: "#171716" },
      },
    },
  },
  {
    id: "high-contrast",
    name: { en: "High contrast", fr: "Contraste élevé" },
    description: { en: "For tired or low-vision eyes: pure black and white, strong lines, a very legible typeface.", fr: "Pour les yeux fatigués ou malvoyants : noir et blanc purs, traits marqués, une police très lisible." },
    fonts: { display: "atkinson-hyperlegible", body: "atkinson-hyperlegible" },
    display: { weight: 700 },
    strong: 700,
    type: { m: 1.0625, s: 0.9375, xs: 0.8125, l: 1.3125, xl: 1.875, xxl: 2.5, leading: 1.55 },
    radius: { s: 4, m: 6, l: 8 }, border: 2,
    light: { bg: "#ffffff", surface: "#ffffff", "surface-2": "#f0f0f0", ink: "#000000", "ink-2": "#1f1f1f", line: "#595959", "line-strong": "#000000", accent: "#0033cc", "accent-ink": "#ffffff", "accent-soft": "#e3e9ff", "accent-text": "#0033cc", ok: "#005c26", "ok-soft": "#e3f5ea", "ok-ink": "#003d19", wait: "#5c3d00", "wait-soft": "#fff2cc", "wait-ink": "#3d2900", danger: "#a30000", "danger-soft": "#ffe5e5", "danger-ink": "#7a0000", focus: "#b3005e", highlight: "#ffee00", "shadow-1": "none", "shadow-2": "0px 0px 0px 2px #000000" },
    dark: { bg: "#000000", surface: "#000000", "surface-2": "#1a1a1a", ink: "#ffffff", "ink-2": "#ebebeb", line: "#a6a6a6", "line-strong": "#ffffff", accent: "#ffd400", "accent-ink": "#000000", "accent-soft": "#2e2800", "accent-text": "#ffd400", ok: "#4ee08a", "ok-soft": "#002611", "ok-ink": "#8af0b4", wait: "#ffc233", "wait-soft": "#2e2200", "wait-ink": "#ffd97a", danger: "#ff7a7a", "danger-soft": "#330000", "danger-ink": "#ffb3b3", focus: "#00e5ff", highlight: "#5c5200", "shadow-1": "none", "shadow-2": "0px 0px 0px 2px #ffffff" },
    palette: { chroma: 1.3 },
  },
];

// The catalogue, in the ranking's order of the tools it comes from, then
// the Chest's own look and high contrast.
export const catalogue: readonly Theme[] = sources.map(defineTheme);
export const themes: ReadonlyMap<string, Theme> = new Map(catalogue.map(t => [t.id, t]));

// themeOf is a catalogue theme by id; undefined for one the kit does not have.
export const themeOf = (id: string): Theme | undefined => themes.get(id);

// identityOf is the catalogue theme that is a tool's own identity.
export const identityOf = (tool: string): Theme | undefined => catalogue.find(t => t.tool === tool);

// The fonts the catalogue names (the Chest must serve these files).
export const catalogueFonts: readonly FontSpec[] = catalogue.flatMap(t => [t.fonts.display, t.fonts.body, t.fonts.mono, t.fonts.accent]).filter(f => f.id);
