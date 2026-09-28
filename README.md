# ChestStore-Dev — the Chest store studio

Where the tools of the Chest store's opening catalogue are chosen, researched,
designed and prototyped, and where the Chest SDK is put to the test. Worked on
by AI coding agents in cloud sessions; reviewed and merged by the owner.

The agent's instructions: [CLAUDE.md](CLAUDE.md). Where things stand:
[PROGRESS.md](PROGRESS.md).

## Map

```
CLAUDE.md       the mission and the rules (read first)
PROGRESS.md     state of the work, updated by every session
brief/          the mission in seven pages
reference/      snapshots of the platform: contract, product specs, two example tools (read-only)
sdk/            the studio's fork of the SDK: 0.2.0 as published, extended with the proposals the tools need
scripts/        add-sdk.mjs (packs the fork into a tool that uses a proposal), and the agents' scripts
lab/            dev harness and tool template (built in phase 2)
tools/
  private/              one folder per team-only tool, each a self-contained repository-to-be
  public-and-private/   one folder per tool that also has a public part
reports/        ranking, open-source research, SDK report, specs of tools not built
showcase/       index.html: every tool's identity side by side (the style contest)
```

## Launching a session

Open this repository in Claude Code on the web and give it a task, e.g.:

- "Phase 0 and 1: check the environment, then do the ranking and the
  open-source research. Open a PR."
- "Phase 2: foundations and the #1 tool of the ranking."
- "Phase 3: build the next tool in PROGRESS.md." (or name one)
- "Phase 4: consolidate the SDK report and the showcase."

## From here to the store

A tool that the owner approves leaves this repository: its folder becomes a
repository of the `chest-by-argentic` organisation (history optional,
`git subtree split --prefix tools/<kind>/<name>`). The SDK proposals it relies
on are proposed to `chest-by-argentic/Chest-SDK` first; once published, its
dependency moves from `vendor/` to the new `@argentic/chest-sdk`.
