# Repository Agent Instructions

## Git authorization

- Do not create a commit unless the user explicitly authorizes committing or starts an autonomous plan execution that creates task-scoped commits on its isolated branch or worktree.
- Autonomous-plan authorization normally covers only commits required by that plan.
- Starting `npm run ralph:run -- docs/plans/<slug>.md` additionally authorizes non-force pushes made by that process only to its exact generated `codex/<slug>` branch. It does not authorize any other push.
- Autonomous execution never authorizes merging, rebasing, squashing, amending, force-pushing, or creating a pull request.
- Do not amend or otherwise rewrite commits unless the user explicitly authorizes that history change.
- Do not push unless the user explicitly authorizes the push or starts the scoped `ralph:run` workflow above.
- Before every authorized non-deletion branch push, review the complete committed branch diff for architecture decisions and record the result with `npm run adr:review`.
- Never use `git push --no-verify` or another mechanism that bypasses the pre-push hook.

## Test execution

- During Codex implementation and verification, run `npm run test:changed`.
- Do not run `npm test` or another full test suite unless the user explicitly requests it.
- If Vitest finds no affected tests, report that result instead of running the full suite.

## ADR review policy

An ADR is required when the branch diff introduces or changes an expensive-to-reverse decision involving:

- persistence, storage, or data/schema design;
- public APIs, wire formats, or protocols;
- security, authentication, authorization, or trust boundaries;
- dependency, framework, or platform selection;
- deployment, runtime, or infrastructure strategy;
- service, module, or ownership boundaries; or
- another architectural choice whose reversal would require coordinated migration.

Routine fixes, tests, formatting, documentation-only corrections, mechanical refactors, and lockfile churn normally do not require an ADR. Before push, record a justified branch review:

```sh
npm run adr:review -- --none --reason "Routine change; no architectural decision."
```

When the branch contains an architectural decision:

- Write one ADR for each independently reversible decision.
- Use `docs/decisions/000N-lowercase-slug.md`, continuing the existing sequence.
- Commit the ADR on the same branch as the decision it documents.
- Never modify or delete an accepted ADR. Write a new ADR that explicitly supersedes the old decision.
- Record every ADR added by the branch, repeating `--adr` when needed:

```sh
npm run adr:review -- \
  --adr docs/decisions/0002-example.md \
  --reason "Records the new persistence boundary."
```

The review marker is valid only for the reviewed local commit, comparison base, target remote branch, and expected remote tip. A new local commit or changed remote branch requires another review. Existing ADRs on both the comparison range and remote tip must remain unchanged.

For a new branch or unusual push target, specify `--base`, `--remote`, or `--remote-ref`. The review command records the architectural review required by an already authorized push; it does not authorize the push itself.

Install the tracked hook after cloning with `npm run hooks:install`. Remote branch deletion and tag pushes do not introduce a branch diff and are outside this ADR gate.
