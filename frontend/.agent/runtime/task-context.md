# Current Task

## Outcome

Preserve the existing remote `main` history on `feature/july-25-work`, then rewrite `main` to the final commit before
July 25 and retain only the isolated `/library` feature from the later history.

## Selected Skills

- frontend-architecture
- ui-quality
- testing

## Supporting Skills

- browser-testing-with-devtools

## Existing Code Inspected

- `src/app/library/page.tsx`
- `src/features/library/LibraryScreen.tsx`
- `src/features/library/components/`
- `src/features/library/model/mockRecordings.ts`
- `tests/library-screen.test.tsx`
- `tests/e2e/library.spec.ts`
- the commit topology around `05909c3`, `e79f2f8`, and `0553246`

## Likely Files

- No manual source edits; Git history is being reconstructed from existing commits.
- The isolated library commit adds ten route, feature, style, and test files.

## Vertical Slice

1. Push the original remote `main` tip to `feature/july-25-work`.
2. Reset local `main` to `05909c3` and cherry-pick only `e79f2f8`.
3. Validate the focused tests, build, browser behavior, final diff, and remote lease before force-pushing `main`.

## Verification

- `.agent/hooks/pre-task.sh`
- `.agent/hooks/post-edit.sh` and `.agent/hooks/review-diff.sh`
- focused Vitest suite for the library
- relevant `/library` Playwright journey
- `npm run typecheck`, `npm run lint`, and `npm run build`
- browser verification at 1440px, 1024px, and below 1024px
- `git push --force-with-lease` only after confirming `origin/main` remains at the preserved tip
