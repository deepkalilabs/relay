# Spec and Implementation Plan: Local Workflow Library

## Objective

Replace the mock Library with a functional, single-user workflow library backed by JSON files on the local Node server. A user can create a draft, open it in the existing recorder/editor, explicitly save changes, finish the initial recording, reload saved work, and reopen it later.

Success means:

- `/` redirects to `/library`.
- **New recording** creates a durable draft before navigating to `/workflows/{id}/edit`.
- **Save workflow** atomically writes the current workflow snapshot.
- **Finish recording** requires at least one step, stops an active Browserbase session, saves the workflow as complete, and returns to `/library?selected={id}`.
- Refreshing the editor restores the last explicitly saved snapshot.
- The Library lists real files, distinguishes drafts, searches and selects them, and opens drafts with **Continue editing** or complete workflows with **Edit workflow**.

## Locked Product Scope

- Local, single-user storage only; no authentication, collaboration, database, remote API implementation, or live filesystem watching.
- Storage defaults to the gitignored `.data/workflows` directory and can be overridden with `WORKFLOW_DATA_DIR`.
- Saving is explicit. There is no debounce, autosave queue, recovery buffer, or navigation-triggered save.
- **Back to library** immediately discards changes since the last successful Save without prompting.
- Empty drafts remain visible until their JSON files are manually removed.
- Library v1 supports only New, select, and open/continue. It has no Run, Delete, Duplicate, Rename, Import, or Export actions.
- Editor replay and JSON export remain. Editor import is removed, and exporting must not mark the workflow clean.
- Existing recorder start/stop mechanics remain; pause/resume and separating browser startup from capture are deferred.
- Invalid workflow files are skipped, valid items still load, and the Library shows a non-blocking invalid-file count. Server logs may include filenames and validation errors, never recorded payload values.

## Contracts and Architecture

### Workflow schema

Promote the canonical workflow format to schema `1.1`:

```ts
type WorkflowStatus = "draft" | "complete";

type Workflow = {
  schemaVersion: "1.1";
  id: string;
  name: string;
  status: WorkflowStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  source: {
    provider: "browserbase";
    sessionId: string;
    startUrl?: string;
  };
  steps: WorkflowStep[];
};

type LibraryWorkflowItem = Pick<
  Workflow,
  "id" | "name" | "status" | "updatedAt"
> & {
  steps: Array<Pick<WorkflowStep, "id" | "name" | "order">>;
};
```

- Continue accepting schema `1.0` at compatibility boundaries and normalize it to `1.1` as a complete workflow with revision `1`; existing replay fixtures and exported files must remain usable.
- The server owns `id`, lifecycle status, revision, and timestamps. Save requests may update the editable workflow snapshot but cannot revert a complete workflow to draft.
- Step ordering continues to use the existing explicit `order` field.

### Repository adapter and filesystem implementation

Add a server-only `WorkflowRepository` port with `list`, `create`, `get`, `save`, and `finish`. A repository factory returns `FileWorkflowRepository` for v1; a future remote implementation can satisfy the same port without changing UI behavior.

- Store one canonical file per workflow as `{uuid}.json`.
- Create `.data/workflows` with user-only permissions where supported; write files with restrictive permissions.
- Validate UUID route parameters, file size, filename/ID agreement, schema, and unique step IDs.
- Save through a same-directory temporary file followed by atomic rename.
- Serialize writes per workflow ID inside the process. Under that lock, reread the current file and compare `expectedRevision`; stale writes fail with a conflict and never overwrite newer data.
- Ignore non-JSON and temporary files. Invalid canonical JSON files increment the warning count but do not break listing.

### Local HTTP API

Intercept `/api/workflows` in the existing custom Node server before delegating other requests to Next.js:

| Method and path | Behavior |
| --- | --- |
| `GET /api/workflows` | Return sanitized `{ workflows: LibraryWorkflowItem[], invalidFileCount }`, sorted by `updatedAt` descending. |
| `POST /api/workflows` | Create and return an empty `Untitled recording` draft at revision `1`. |
| `GET /api/workflows/{id}` | Return the canonical saved workflow or `404`. |
| `PUT /api/workflows/{id}` | Validate `{ workflow, expectedRevision }`, preserve lifecycle status, increment revision, and return the saved workflow. |
| `POST /api/workflows/{id}/finish` | Require at least one step, apply the snapshot at the expected revision, set complete/`finishedAt`, and return the saved workflow. |

Use consistent JSON errors: `400` invalid input, `404` missing workflow, `409` stale revision, and `500` storage failure. Do not return filesystem paths or sensitive workflow values in error messages.

## User Flow and State

### Library

- Replace mock models with `LibraryWorkflowItem` data loaded from the internal API on page load.
- Keep the checkout-style mock browser preview static and decorative for every workflow.
- Keep the existing search and selection interaction. Honor `?selected={id}` when present, otherwise select the first visible workflow.
- Show a real empty state with **New recording**. Creation waits for `POST /api/workflows` before navigation.
- Selecting an item loads its full workflow details and real ordered step names. Drafts show a Draft badge and **Continue editing**; complete items show **Edit workflow**.
- A manual browser refresh is the v1 mechanism for reflecting files added or removed outside the app.

### Editor

- Add `/workflows/[workflowId]/edit` and load the saved workflow before enabling editing. Show explicit loading, not-found, and load-failure states.
- Change session start handling from workflow reset to `setSessionId`, preserving the persisted workflow ID and existing steps.
- Starting a browser for a loaded workflow never opens the current “discard and start” confirmation.
- Track `dirty`, `saving`, `saved`, `error`, and `conflict` states. Successful Save replaces server-owned metadata and marks the reducer clean.
- A conflict keeps the local unsaved snapshot visible and offers **Reload saved version** only.
- Completed workflows remain complete when edited and show Save rather than Finish.
- Draft Finish validates the snapshot, stops an active session first, calls the finish API, then routes to the selected Library item. A stop or save failure keeps the editor open with an actionable error.

## Delivery and Verification

Implement in vertical slices matching `tasks/todo.md`; do not mix this work with the remaining refactor-plan phases. Preserve feature public APIs and the current import-direction lint rules.

Commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Required test scenarios:

- Schema `1.0` normalization and schema `1.1` validation.
- Repository create/list/get/save/finish, atomic replacement, revision conflicts, concurrent writes, missing files, invalid files, and custom storage root.
- HTTP success and `400`/`404`/`409`/`500` mappings without sensitive error leakage.
- Library empty/list/search/selection/draft/complete/invalid-warning behavior.
- Editor load, explicit save, dirty state, reload conflict recovery, complete-workflow editing, export-not-cleaning, and removed import UI.
- End-to-end: create draft, add a manual step, save, refresh and restore, finish, return selected to Library, then reopen the complete workflow.
- Existing recorder, replay, accessibility, and 1024px viewport suites remain green.

## Boundaries and Assumptions

- Always validate untrusted disk and HTTP data with Zod, use atomic writes, keep `.data/` gitignored, and preserve sensitive-value warnings on export.
- Ask before adding dependencies, implementing a remote repository, changing the no-auth localhost model, or adding deletion/import/autosave.
- Never log workflow payloads, commit `.data/`, silently overwrite a stale revision, or weaken existing replay/recorder tests.
- The working default for unanswered invalid-file policy is “skip and warn,” as described above.
