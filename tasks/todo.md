# Local Workflow Library Tasks

- [x] Task 1: Introduce the versioned persistent workflow contract.
  - Acceptance: Canonical workflows use schema `1.1` lifecycle/revision fields; schema `1.0` inputs normalize compatibly; replay remains compatible.
  - Verify: Focused schema, import/export, workflow reducer, and protocol tests.
  - Files: `src/lib/workflow/domain.ts`, `src/lib/workflow/schema.ts`, `src/lib/workflow/import.ts`, `tests/workflow-import.test.ts`, `tests/workflow.test.ts`

- [x] Task 2: Build and test the server repository boundary.
  - Acceptance: Filesystem create/list/get/save/finish is atomic, validates IDs and files, serializes same-ID writes, rejects stale revisions, and reports invalid-file counts.
  - Verify: Repository tests use an isolated temporary directory and cover concurrent saves.
  - Files: `src/server/workflows/repository.ts`, `src/server/workflows/filesystem-repository.ts`, `tests/workflow-repository.test.ts`, `.gitignore`

- [x] Task 3: Expose the local workflow HTTP API.
  - Acceptance: The custom server routes the five specified operations and maps validation, missing, conflict, and storage errors consistently.
  - Verify: HTTP router tests exercise requests without starting Browserbase.
  - Files: `src/server/workflows/http-router.ts`, `src/server/workflows/errors.ts`, `server.ts`, `tests/workflow-api.test.ts`

- [x] Task 4: Replace the mock Library with API-backed workflow summaries.
  - Acceptance: `/library` handles loading, empty, warning, search, selection, New recording, real step details, and draft/complete editor actions; mock data is removed.
  - Verify: Library component tests plus accessibility and 1024px E2E checks.
  - Files: `src/features/library/LibraryScreen.tsx`, `src/features/library/components/RecordingDetails.tsx`, `src/features/library/model/workflow-library.ts`, `src/app/library/page.tsx`, `tests/library-screen.test.tsx`

- [x] Task 5: Add durable editor routing and loading.
  - Acceptance: `/` redirects to Library; `/workflows/{id}/edit` loads by ID with loading/not-found/error states; session start preserves the workflow identity and steps.
  - Verify: Controller tests cover load and session-start behavior; existing workspace tests use the ID route.
  - Files: `src/app/page.tsx`, `src/app/workflows/[workflowId]/edit/page.tsx`, `src/app/workspace/RecorderWorkspace.tsx`, `src/app/workspace/useWorkspaceController.ts`, `tests/workspace-persistence.test.tsx`

- [x] Task 6: Implement explicit Save and Finish behavior.
  - Acceptance: Save updates revision and clean state; Back discards unsaved state; conflicts offer Reload; Finish stops recording, persists complete status, and selects the workflow in Library; editor import is removed and export does not mark clean.
  - Verify: Reducer/controller/component tests cover success and every failure state.
  - Files: `src/app/workspace/WorkspaceNavbar.tsx`, `src/app/workspace/useWorkspaceController.ts`, `src/lib/workflow/store.ts`, `src/features/recorder/useRecorderSession.ts`, `tests/workspace-persistence.test.tsx`

- [x] Task 7: Complete integration coverage and documentation.
  - Acceptance: The manual-step create/save/refresh/finish/reopen journey passes; `.data/` and `WORKFLOW_DATA_DIR` are documented; obsolete mock/non-persistence claims are removed.
  - Verify: Full typecheck, lint, unit/component tests, build, and local Playwright suite.
  - Files: `tests/e2e/library.spec.ts`, `tests/e2e/workspace.spec.ts`, `README.md`, `.env.example`
