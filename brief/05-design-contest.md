# 5. The UX bar and the style contest

## Who uses these tools

Not developers. An office manager, a salesperson on a phone between two
meetings, a warehouse lead, a 58-year-old accountant who is wary of new
software. They did not choose the tool; their boss installed it. **If they
hesitate, we lose.**

## The UX bar — every tool, every screen

- **One obvious action per screen.** The main thing the screen is for is the
  most visible thing on it. Secondary actions are quieter; rare ones live in a
  menu.
- **Few words, plain words.** No jargon ("instance", "entity", "sync",
  "workspace settings"). Labels a child could read. No paragraphs of help:
  if a screen needs explaining, redesign it.
- **Useful at first sight.** An empty tool is not a blank page: the empty
  state shows what it is for and offers the first action ("Add your first
  task"), or a one-click example.
- **Forgiving.** Undo instead of "Are you sure?" whenever possible. Nothing is
  lost by a misclick, a back button or a closed tab (drafts).
- **Fast.** Instant feedback on every action (optimistic updates), no spinner
  for what takes under 300 ms, pages that load in under a second on the
  Chest's small server.
- **Everywhere.** Designed for 390 px phones as much as for desktops — many
  of these people will use it on a phone.
- **For everyone.** Keyboard, screen readers, WCAG AA contrast, visible
  focus, text that scales, `prefers-reduced-motion` respected, dark mode
  where it makes sense.
- **Consistent within the tool, familiar across the web.** Standard patterns
  (a list, a board, a calendar, a form) beat clever ones.
- **Two languages.** English first, French second, from day one, with a
  visible language switch: design for the longer French strings.

Test each main flow against these questions and write the answers in the
tool's README ("First minute"): What does a new user see first? What is the
first thing they do? How many clicks to do the main job? What happens when
they make a mistake?

## The style contest

Each tool has **its own identity** — the owner will compare them side by side
and choose the best direction for the whole store. So do not converge: each
tool is a chance to try a different, strong, well-executed style. Examples of
directions (inspiration, not assignments): calm editorial with a serif,
bold geometric colour blocks, soft rounded friendly, dense pro tool with a
monospace touch, warm paper and ink, Swiss grid black and white, playful
illustrated, glassy and luminous… Each must still pass the UX bar: identity
never costs clarity.

The Chest portal itself is black-and-white, editorial, Swiss. **A tool must
not look like the Chest portal** (it could be mistaken for it) and must never
use the Chest or Argentic name or logo in its own identity.

### Per tool: `DESIGN.md`

1. **Name and personality** — the tool's name (short, a word a non-English
   speaker can say; `title` in `chest.json`) and three adjectives.
2. **Tokens** — colours (with contrast ratios checked), typography (self-hosted
   fonts, licence), spacing scale, radii, shadows, motion; defined once as CSS
   custom properties (`app/tokens.css` or similar), light and dark.
3. **Components** — the handful the tool uses (buttons, inputs, list rows,
   cards, empty state, toast…), their states.
4. **Icon** — `chest/icon.svg`: readable at 24 px on a light and a dark tile,
   no text in it.
5. **Why** — why this identity fits this tool and its users.

### The gallery: `showcase/index.html`

One static page (opens with a double-click, no server, no network) that shows
every tool side by side: icon, name, one-line description, palette swatches,
type specimen, and its screenshots (desktop and phone) if they exist. Built by
`scripts/build-showcase.mjs` from each tool's `DESIGN.md` tokens and
`docs/screens/` (both `tools/private/` and `tools/public-and-private/`, shown as two groups), re-run whenever a tool changes. Keep it beautiful: it is the
page the owner judges the contest on.
