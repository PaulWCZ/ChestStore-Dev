# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| DM Sans (font) | [The DM Sans Project Authors](https://github.com/googlefonts/dm-fonts), via `@fontsource-variable/dm-sans` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-dm-sans.txt` |
| DM Serif Display (font) | [The DM Serif Display Project Authors](https://github.com/googlefonts/dm-fonts), via `@fontsource/dm-serif-display` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-dm-serif-display.txt` |

**No code is copied from other projects.** The logic engine
(`lib/logic.ts`), the validation, the summary and the CSV writer are our
own. The anonymity design (participants apart, rows rewritten in a random
order, nothing shown under five answers) and the CSV writer follow the
studio's own Polls and Hiring tools (same licence, same studio).

Ideas only, no code (research: `reports/02-open-source/forms.md` in the
studio):

- Typeform and Tally (proprietary): one question at a time with letter keys
  and Enter, the classic one-page layout, logic jumps, hidden fields/prefill,
  automatic deletion of answers.
- Formbricks (AGPL-3.0), HeyForm (AGPL-3.0), OpnForm (AGPL-3.0),
  OhMyForm (AGPL-3.0), LimeSurvey (GPL-2.0-or-later), Form.io server
  (OSL-3.0): question cards expanding in place, per-question summaries and
  the NPS, closing date and answer limit, anonymised responses.
- SurveyJS Form Library (MIT) and `@formio/js` (MIT) were considered and
  not used: both impose their own look and are far larger than needed.

Dependencies from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@argentic/chest-sdk` (MIT, the
studio's working copy in `vendor/`). Icons drawn for this tool.
