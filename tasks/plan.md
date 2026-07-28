# Spec and Implementation Plan: JSON-Backed Profile Library

## Objective

Replace the static `/profile` prototype with a local, single-user profile library. Users can create an unsaved form, explicitly persist it, select and edit saved profiles, recover from revision conflicts, and permanently delete a profile after confirmation.

Profiles store fixed identity and location fields. Workflow execution integration, browser configuration, autosave, import/export, search, remote storage, and recovery/trash are out of scope.

## Contract and Persistence

- Shared schema `1.1` profiles contain UUID, bounded normalized fields, derived `draft | ready` status, revision, and ISO timestamps. Legacy `1.0` files normalize by dropping browser metadata and recalculating status.
- A profile becomes Ready only when every field is nonblank and email syntax is valid; incomplete and invalid-email drafts remain persistable.
- `ProfileRepository` defines list/create/get/save/delete. `FileProfileRepository` stores private `.data/profiles/{uuid}.json` files, configurable through `PROFILE_DATA_DIR`.
- Writes are bounded to 64 KiB, serialized per ID, revision-protected, and replaced atomically. Invalid canonical files are skipped and counted without exposing identity data.

## HTTP and UI

- `/api/profiles` supports summary list and create; `/api/profiles/{id}` supports full read, revisioned save, and revisioned delete.
- The profile screen loads summaries first and full details only for the selected ID. `?selected={id}` preserves selection.
- New profiles remain client-only until first Save. Selection and New immediately discard unsaved edits.
- The screen exposes loading, empty, invalid-file, detail failure, save failure, conflict recovery, and delete failure states.
- Deletion uses the shared focus-trapped modal. Profiles have no browser configuration or workflow Run control.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Tests cover schema/readiness behavior, filesystem concurrency and invalid files, HTTP/client wire contracts, CRUD component interactions, accessible modal focus, the complete browser journey, and supported viewport behavior.

## Boundaries

- Never log profile values or storage paths.
- Ask before adding remote storage, authentication, autosave, profile import/export, or workflow-run integration.
- External file changes appear after refresh; cross-process locking and filesystem watching remain out of scope.
