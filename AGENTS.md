# Repository Agent Instructions

## Commit authorization

- Do not create, amend, or otherwise rewrite a commit unless the user explicitly authorizes committing.
- Before every authorized commit, review the exact staged diff for architecture decisions and record the result with `npm run adr:review`.
- Do not use `git commit --no-verify`, `git commit -a`, partial/pathspec commits, or a shell command that stages and commits in one invocation.

## Test execution

- During Codex implementation and verification, run `npm run test:changed`.
- Do not run `npm test` or another full test suite unless the user explicitly requests it.
- If Vitest finds no affected tests, report that result instead of running the full suite.

## ADR review policy

An ADR is required when the staged diff introduces or changes an expensive-to-reverse decision involving:

- persistence, storage, or data/schema design;
- public APIs, wire formats, or protocols;
- security, authentication, authorization, or trust boundaries;
- dependency, framework, or platform selection;
- deployment, runtime, or infrastructure strategy;
- service, module, or ownership boundaries; or
- another architectural choice whose reversal would require coordinated migration.

Routine fixes, tests, formatting, documentation-only corrections, mechanical refactors, and lockfile churn normally do not require an ADR. They still require an exact staged-diff review:

```sh
npm run adr:review -- --none --reason "Routine change; no architectural decision."
```

When an ADR is required:

- Write one ADR for each independently reversible decision.
- Use `docs/decisions/000N-lowercase-slug.md`, continuing the existing sequence.
- Add the ADR to the same staged state as the decision it documents.
- Never modify or delete an accepted ADR. Write a new ADR that explicitly supersedes the old decision.
- Record all staged ADRs, repeating `--adr` when needed:

```sh
npm run adr:review -- \
  --adr docs/decisions/0002-example.md \
  --reason "Records the new persistence boundary."
```

The review marker is valid only for the exact `HEAD` and staged index state that was reviewed. Any staging or `HEAD` change requires another review.

## Bypass recovery

Git post-commit records a private `manual-review-required` audit when pre-commit enforcement is bypassed.

- If the bypassed commit was routine, resolve it explicitly:

```sh
npm run adr:audit -- --commit <sha> --none --reason "Routine change; no ADR required."
```

- If it contained an architectural decision, write and stage a follow-up ADR that references the full bypassed commit SHA, then review it with `--remediates`:

```sh
npm run adr:review -- \
  --adr docs/decisions/000N-example.md \
  --remediates <sha> \
  --reason "Documents the decision introduced by the bypassed commit."
```

Do not amend or recursively create commits during recovery. A follow-up commit still requires explicit user authorization.
