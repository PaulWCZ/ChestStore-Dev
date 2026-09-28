# 7. The plan: phases, sessions, budget, Git

You work in **cloud sessions** on a limited budget (about $250 of credits in
total for the whole project). Several sessions will follow one another, maybe
in parallel. Spend where it shows: decisions, great tools, a sharp report.

## Phases

| Phase | Output | One PR each | Rough share of the budget |
|---|---|---|---|
| **0. Check the environment** | In PROGRESS.md: Node and npm versions, whether PostgreSQL, a container runtime and a headless browser can run here, whether the web is reachable | (with phase 1) | ~2 % |
| **1. Ranking and research** | `reports/01-ranking.md`, `reports/02-open-source/<tool>.md` for every chosen tool | 1 PR | ~10 % |
| **2. Foundations + first tool** | `lab/chest-dev/` (dev harness), `scripts/check-manifest.mjs`, `lab/template/` (the starter every tool copies), the **#1 tool** built with them | 1 PR | ~12 % |
| **3. The tools** | The next tools in ranking order, one per PR, each in `tools/private/` or `tools/public-and-private/`; the SDK fork, the SDK report and the showcase grow with them | 1 PR per tool | ~65 % |
| **4. Consolidation** | `reports/03-sdk-report.md` final, `showcase/index.html` final, PROGRESS.md summary | 1 PR | ~8 % |

Keep a reserve: if the budget runs low, **ten excellent tools beat twenty
average ones.** Tools that you cannot build in time still get their research
file and a one-page spec in `reports/04-specs/<tool>.md` (screens, data model,
roles, SDK needs), so that they can be built later.

## Working economically

- Read `CLAUDE.md`, `PROGRESS.md` and only the brief pages and reference files
  the task needs. `reference/contract/application-contract.md` is long: search
  it, do not read it whole.
- Build on `lab/template/` and on what previous tools solved; do not re-solve.
- Web research: targeted searches, read licences and READMEs, not whole sites.
- Prefer fewer, deeper iterations on a screen over many screenshots.

## Sessions

At the **start** of a session: read `CLAUDE.md` and `PROGRESS.md`; take the
task the prompt names, or the next one in PROGRESS.md.

At the **end** of a session (or before running out): update `PROGRESS.md` —
what is done, what is next, what is blocked, open questions for the owner —
commit, push, open or update the PR. A session that ends without updating
PROGRESS.md loses its work for the next one.

Parallel sessions work on different tools; each touches only its own
tool folder, its own report files, and its own row in PROGRESS.md. The SDK
fork is shared: keep each proposal in its own module, and rebase before
opening the PR.

## Git

- One branch and one pull request per deliverable (phase 1, phase 2, each
  tool, phase 4), against `main`. The owner reviews and merges; never merge
  yourself.
- If the previous PR is not merged yet and you need it, branch from it and say
  so in the PR description.
- Commits in English, small and meaningful. No secrets, no `node_modules`, no
  build output (`.gitignore`).
- The PR description: what it delivers, how it was verified (commands run and
  their result), what is stubbed or unverified, screenshots if any.

## Questions for the owner

When a decision is the owner's (a licence choice, dropping a tool, a product
rule you would change), do not stop: take the most reasonable option, write it
in PROGRESS.md under "Questions for the owner" with your recommendation, and
continue.
