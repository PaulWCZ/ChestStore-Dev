# ChestStore-Dev — the Chest store studio

Where the tools of the store Chest launches with are chosen, researched,
designed and built — to production quality, as real candidates for the store —
and where the Chest SDK is pushed forward. Worked on autonomously by an AI
coding agent in long cloud sessions; reviewed and merged by the owner.

The agent's instructions: [CLAUDE.md](CLAUDE.md). Where things stand:
[PROGRESS.md](PROGRESS.md).

## Map

```
CLAUDE.md       the mission and the rules (read first)
PROGRESS.md     state of the work: the agent's memory between runs
brief/          the mission in seven pages
reference/      snapshots of the platform: contract, product specs, two example tools (read-only)
sdk/            the studio's fork of the SDK: 0.2.0 as published, extended with the proposals the tools need
scripts/        add-sdk.mjs (packs the fork into a tool that uses a proposal), and the agents' scripts
lab/            dev harness and tool template (built in step 2)
tools/
  private/              one folder per team-only tool, each a self-contained repository-to-be
  public-and-private/   one folder per tool that also has a public part
reports/        ranking, open-source research, SDK report, specs of tools not built
showcase/       index.html: every tool's identity side by side (the style contest)
```

## Launching a session

Open this repository in Claude Code on the web and give it one prompt:

> Read CLAUDE.md and PROGRESS.md, then carry out the whole mission
> autonomously, following brief/07-plan.md. Do not stop to ask or report:
> keep building, verifying, committing and pushing until the credits run out.

A later run takes over from PROGRESS.md with the same prompt.

## From here to the store

A tool that the owner approves leaves this repository: its folder becomes a
repository of the `chest-by-argentic` organisation (history optional,
`git subtree split --prefix tools/<kind>/<name>`). The SDK proposals it relies
on are proposed to `chest-by-argentic/Chest-SDK` first; once published, its
dependency moves from `vendor/` to the new `@argentic/chest-sdk`.
