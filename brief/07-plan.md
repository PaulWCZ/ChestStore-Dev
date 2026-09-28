# 7. The plan: work autonomously, for as long as the credits last

You have about **$250 of credits** and one job: build the tools of the store
Chest will open with. The owner wants you to **use all of it, alone**, in one
long run (or several, each picking up where the last stopped). There is no
reviewer waiting on each step, nobody to answer a question mid-way. You
decide, you build, you verify, you move on.

## The one rule of autonomy

**Never stop while there is credit left and something could be better.**
Do not end your turn to report, to ask, or because "a phase is done". When
a task is finished, write it down in PROGRESS.md, commit, push, and start the
next one immediately. If you ever think you are done, you are not: go to
"When the list is done" below.

- **Decisions are yours.** When something is the owner's call (dropping a
  tool, a licence, a product rule), take the most reasonable option, note it
  in PROGRESS.md under "Questions for the owner" with your recommendation, and
  continue. Never wait for an answer.
- **Blocked?** Work around it, note it, move to the next task. A missing
  platform feature is not a blocker: design it in the SDK fork (brief/03).
- **Verify yourself.** Tests, builds, running the tool in the dev harness,
  looking at its screens. "Done" means verified, never assumed.

## The work, in order

| Step | Output |
|---|---|
| **0. Environment** | In PROGRESS.md: Node/npm versions, whether PostgreSQL, a container runtime, a headless browser and the web are available here; how you will work around what is missing |
| **1. Ranking and research** | `reports/01-ranking.md` (10–20 tools, ordered), `reports/02-open-source/<tool>.md` for each; the Tools table of PROGRESS.md filled in |
| **2. Foundations** | `lab/chest-dev/` (dev harness on the SDK fork's `fakeChest`), `scripts/check-manifest.mjs`, `lab/template/` (the starter each tool copies), `scripts/build-showcase.mjs` |
| **3. The tools** | Each tool of the ranking, in order, to the definition of done (brief/03); the SDK fork, the SDK report and the showcase grow with them |
| **4. The report** | `reports/03-sdk-report.md` consolidated, `showcase/index.html` complete |
| **5. Better** | See "When the list is done" |

Rough spending: steps 0–2 about a quarter, the tools about two thirds, the
rest for the report and the second pass. Do not rush the first tools to reach
the twentieth: **a tool enters the store only if it is excellent.** Ten tools
the owner accepts beat twenty that must be rewritten.

## When the list is done

Keep going, in this order, until the credits run out:

1. **Audit every tool against the definition of done and the UX bar**, as a
   demanding reviewer would: open each screen, try each flow as a
   non-technical user, on a phone width, in French. Fix what you find.
2. **Deepen the best tools**: the features the research marked "later" that
   users would miss most; importers from the SaaS they replace.
3. **Make the tools a suite**: links and events between them through the SDK
   fork (a form response becomes a CRM contact, a leave request shows in the
   team calendar…).
4. **Add the next tools** of the ranking (up to 20, then beyond if it still
   makes sense).
5. **Sharpen the SDK fork and the report**: simpler APIs, better fakes, better
   errors, the docs an outside developer would need.

## Keeping the thread

Your context will be compacted and a later run may take over: **PROGRESS.md
is your memory.** Update it after every meaningful step (not only at the end):
what is done and verified, what you are on, what comes next, decisions taken,
questions for the owner. Read it first whenever you (re)start.

Work economically so the credits go into the tools:

- Read only the brief pages and reference files the task needs;
  `reference/contract/application-contract.md` is long — search it.
- Build on `lab/template/` and on what earlier tools solved.
- Targeted web research: licences, READMEs, feature lists — not whole sites.

## Git

- Work on the branch your environment gives you (or `studio`), never directly
  on `main`. **Commit and push after every finished step** — a tool, a report,
  a fix batch — so nothing is lost if the run stops. Small, meaningful commits
  in English. No secrets, no `node_modules`, no build output.
- Open one pull request against `main` early (after step 1) and keep pushing
  to it; keep its description current: what is in it, how each tool was
  verified, what is not verified. The owner merges; you never wait for it.
