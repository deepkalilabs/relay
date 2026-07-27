# Browser Memory Recorder Refactor Plan

## Purpose

This plan applies the frontend engineering inspection checklist to the current repository. It is intentionally behavior-preserving: the recorder, workflow editor, Browserbase Live View, replay controls, import/export format, and WebSocket protocol should continue to work throughout the refactor.

The repository has a solid base. TypeScript strict mode is enabled, the application has a documented setup path, workflow data is modeled explicitly, untrusted inputs are validated with Zod, dependencies are locked with `package-lock.json`, and the test suite covers important recorder and replay behavior. The main refactor opportunity is to turn the existing informal boundaries into enforceable ones and reduce the amount of application behavior coordinated by a few large files.

## Inspection snapshot

### What is already strong

- `tsconfig.json` enables `strict`, `noEmit`, and `isolatedModules`.
- `package.json` exposes `dev`, `build`, `typecheck`, `lint`, `test`, and E2E commands.
- `README.md` documents Node, npm, environment setup, the custom server, security constraints, and the verification loop.
- Secrets are read by the Node server; no `NEXT_PUBLIC_` Browserbase credential was found.
- Workflow concepts have explicit domain types in `src/lib/workflow/domain.ts`.
- Zod validates workflow imports, exports, recorded actions, and WebSocket messages.
- The workflow reducer keeps step order, selection, dirty state, deletion recovery, and timestamps together.
- UI state such as panel sizing and overlays is local rather than application-global.
- Server provider access is behind `BrowserProvider`.
- Tests cover reducer behavior, schema/import behavior, session event handling, UI state, accessibility, recorder injection, navigation, replay recovery, and the Browserbase adapter.

### Verification observed during inspection

- Type-check: passed.
- Lint: passed with zero warnings.
- Unit/component tests: 99 passed.
- Local Playwright E2E: 22 passed; the paid Browserbase smoke test was skipped as designed.
- Production build: not conclusively verified. A development process was using `.next`, and a later build attempt was interrupted before completion.

These results are a baseline, not permission to weaken tests during extraction.

### Main findings

| Priority | Area                              | Evidence                                                                                                                                                                          | Consequence                                                                                                         |
| -------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P0       | Reproducible foundation           | `.nvmrc` selects Node 24, while `engines.node` currently permits Node 24 through 26, npm is not constrained, and the inspected shell used Node 23.                                | Local and CI results can differ before application code runs.                                                       |
| P0       | Automated quality gate            | Commands exist, but no repository CI workflow, aggregate `verify` command, or formatter configuration was found.                                                                  | The documented quality loop depends on each contributor remembering every command.                                  |
| P0       | Environment validation            | `server.ts` reads and coerces environment variables inline. Invalid numeric values can become `NaN`, and defaults/ranges are distributed through startup code.                    | Configuration errors surface late and are harder to test or explain.                                                |
| P1       | Application composition           | `src/app/page.tsx` delegates to `features/recorder/RecorderWorkspace.tsx`, which imports browser, replay, workflow, recorder, shared UI, and persistence modules.                 | The recorder feature acts as the application layer, so feature ownership and dependency direction are unclear.      |
| P1       | Cross-feature imports             | `BrowserPanel.tsx` imports recorder and replay controls directly. Workflow UI imports recorder session result types.                                                              | Browser, recorder, replay, and workflow features cannot evolve or be removed independently.                         |
| P1       | Session state ownership           | `useRecorderSession.ts` contains roughly twenty independent state values, a large server-message switch, command dispatch, timers, derived display state, and reset logic.        | Valid state combinations are implicit, transition logic is difficult to audit, and duplicated reset code can drift. |
| P1       | Oversized coordinators            | `RecorderWorkspace.tsx` is 335 lines and `BrowserPanel.tsx` is 284 lines with a very broad prop contract.                                                                         | Presentation, orchestration, policy, and side effects are mixed, making focused tests and replacement harder.       |
| P1       | Unsafe editor updates             | `StepEditor.tsx` repeatedly casts partially updated objects to `WorkflowStep`.                                                                                                    | The discriminated union is bypassed at the exact boundary where users mutate workflow data.                         |
| P2       | Protocol cohesion                 | `src/lib/protocol.ts` contains session, browser, picker, CAPTCHA, replay, diagnostics, and transport envelopes in one schema.                                                     | A change to one message family requires touching a global protocol module.                                          |
| P2       | Server orchestration              | `RecordingRuntime` is about 970 lines and owns session lifecycle, pages, recorder installation, CAPTCHA state, pickers, navigation, replay coordination, sequencing, and cleanup. | Server behavior is well tested but expensive to understand and risky to change.                                     |
| P2       | Replay engine cohesion            | `engine.ts` is about 627 lines and combines preflight, frame/locator resolution, action execution, settling, wait conditions, recovery, and run orchestration.                    | Replay policies cannot be tested or changed independently.                                                          |
| P2       | Injected recorder maintainability | `injected.ts` is a roughly 558-line raw script string.                                                                                                                            | Logic inside the string receives less direct TypeScript, lint, and modularity support than normal source files.     |
| P2       | Test organization                 | Several test files are very large, including navigation, component, replay, and recorder-fixture suites.                                                                          | Coverage is strong, but ownership and failure localization will worsen as features grow.                            |

## Target dependency model

Use `app` as the composition boundary and make feature APIs explicit:

```text
app
 ├── recorder
 ├── browser
 ├── workflow
 └── replay
       ↓
shared contracts and utilities
       ↓
design-system primitives
```

Server code may depend on shared contracts and server adapters, but client features must not import server modules.

Recommended target structure:

```text
src/
  app/
    workspace/
      RecorderWorkspace.tsx
      useWorkspaceController.ts
      workspace.types.ts

  features/
    browser/
      components/
      model/
      index.ts
    recorder/
      components/
      model/
        session.reducer.ts
        session.selectors.ts
        session.types.ts
        useRecorderSession.ts
      transport/
        useRecorderSocket.ts
      index.ts
    replay/
      components/
      model/
      index.ts
    workflow/
      components/
      model/
        workflow.reducer.ts
        workflow.commands.ts
      persistence/
        importWorkflow.ts
        exportWorkflow.ts
      index.ts

  shared/
    contracts/
      protocol/
      workflow/
    config/
    ui/

  server/
    app/
    config/
    provider/
    recording/
    replay/
```

This is a destination, not a request for one large file-moving change. Move code only when a boundary has an API and tests.

## Refactor principles

1. Keep each pull request behavior-preserving unless it is explicitly labeled as a product change.
2. Prefer extraction behind an existing interface over a repository-wide rewrite.
3. Preserve the workflow JSON schema version and WebSocket message behavior.
4. Store source state once and calculate display state through selectors.
5. Model lifecycle transitions with discriminated actions rather than coordinated setter calls.
6. Keep Browserbase and Playwright types at adapter boundaries.
7. Add an enforceable dependency rule before relying on the new folder structure.
8. Keep the application usable and the baseline test suites passing after every phase.

## Phased implementation

## Phase 0 — Make the quality loop reproducible

### 0.1 Pin and enforce the runtime

- Keep `.nvmrc` on the maintained Node 24 LTS line.
- Set `engines.node` to `>=24 <25` and add `engines.npm` as `>=11 <12`.
- Add npm `devEngines` checks for the same Node and npm major ranges with `onFail: "error"`.
- Add `.npmrc` with `engine-strict=true`.
- Do not add an exact `packageManager` value: this repository intentionally accepts maintained patch releases within Node 24 and npm 11.
- Ensure CI uses `.nvmrc` instead of duplicating a Node version.
- Document that simultaneous `next dev` and `next build` executions must not share the same `.next` directory. Stop the development server before a local production build; CI build verification runs in a clean job.

Acceptance criteria:

- Node 24 and npm 11 satisfy the declared `engines` and `devEngines`; unsupported major versions fail before normal npm project commands run.
- `npm ci` succeeds from a clean checkout.
- A clean production build completes independently of a local dev server.

### 0.2 Create one verification entry point

- Add a `verify` script that runs formatting checks, type-checking, linting, unit/component tests, and the production build.
- Keep local E2E as a separate `verify:e2e` job because it starts a server and browser.
- Keep paid Browserbase verification opt-in and isolated from normal CI.
- Add a CI workflow with:
  - dependency installation via `npm ci`;
  - `npm run verify`;
  - local Playwright E2E;
  - npm caching and an explicit Playwright Chrome installation.
- Run the workflow for pull requests and pushes to `main`.
- Never set `BROWSERBASE_E2E` or provide Browserbase credentials in normal CI.
- Treat branch protection as a repository setting outside the workflow: if pull requests are introduced later, configure both CI jobs as required checks.

Acceptance criteria:

- Pushes to `main` and pull requests report failures from formatting, type-checking, linting, tests, build, and local E2E.
- When pull requests are used, repository branch protection requires both CI jobs before merge.
- The Browserbase smoke test never runs accidentally.

### 0.3 Add deterministic formatting

- Use Prettier with a 120-character print width.
- Add `format` and `format:check` scripts.
- Land one isolated repository-wide Prettier baseline before enabling `format:check` in CI.
- After that baseline, format only files touched by each refactor change so structural diffs stay focused.
- Add `.editorconfig` for baseline editor behavior.

Acceptance criteria:

- Formatting is automated and checked in CI.
- Refactor diffs are not mixed with an unrelated repository-wide formatting change.

### 0.4 Centralize server environment validation

- Create `src/server/config/env.ts`.
- Parse `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `BROWSERBASE_REGION`, `BROWSERBASE_SESSION_TIMEOUT_SECONDS`, `PORT`, and `NODE_ENV` once with Zod.
- Apply defaults and numeric ranges in the schema.
- Return an explicit configuration object to server composition.
- Preserve the current behavior where a missing API key allows the UI to show “Setup required.”
- Keep secret-bearing values server-only.

Acceptance criteria:

- No production server module reads these runtime configuration variables directly outside the config module.
- Playwright configuration and tests may continue reading CI and opt-in test-control variables directly.
- Invalid ports, timeouts, and regions fail with actionable messages.
- Unit tests cover defaults, missing optional values, and invalid values.

## Phase 1 — Establish application and feature boundaries

### 1.1 Move workspace composition into `app`

- Move the cross-feature orchestration responsibility from `features/recorder/RecorderWorkspace.tsx` to `app/workspace/RecorderWorkspace.tsx`.
- Extract non-rendering coordination into `useWorkspaceController.ts`.
- Keep `src/app/page.tsx` as the route entry and render the app-owned workspace.
- Leave recorder-specific controls and session behavior inside `features/recorder`.

The app layer should be the only place that knows the complete arrangement of browser, workflow, recorder, and replay features.

Acceptance criteria:

- Recorder code no longer imports workflow or browser feature internals.
- Removing replay UI does not require editing recorder model code.
- The workspace component primarily composes feature views and maps controller state to props.

### 1.2 Add feature public APIs

- Add a small `index.ts` to each feature.
- Export only supported components, hooks, types, and actions.
- Replace imports of feature-internal paths with public feature imports.
- Add ESLint restricted-import rules or an equivalent boundary check:
  - `shared` cannot import `features` or `app`;
  - a feature cannot import another feature’s internals;
  - client code cannot import `server`;
  - `app` may compose feature public APIs.

Acceptance criteria:

- Dependency direction is mechanically checked.
- Circular feature dependencies are absent.
- Shared folders contain code used by more than one owner, not displaced feature code.

### 1.3 Remove browser-to-recorder and browser-to-replay coupling

- Make `BrowserPanel` responsible for browser chrome, navigation, Live View, and browser overlays.
- Pass recorder/replay transport controls through an intent-based slot such as `toolbar` or compose them beside the browser view in the app layer.
- Move replay-failure actions to replay-owned presentation or pass a replay status panel as a slot.
- Define browser-owned picker and page-state types in the browser feature rather than `lib/recorder-session`.

Acceptance criteria:

- `features/browser` imports neither `features/recorder` nor `features/replay`.
- Browser rendering can be tested with simple browser-view props.
- Recorder and replay controls can change without editing browser internals.

### 1.4 Put files under their actual owners

- Move `src/hooks/use-recorder-socket.ts` to `features/recorder/transport`.
- Move recorder presentation and lifecycle types out of `src/lib/recorder-session.ts`.
- Move the workflow reducer from generic `lib` to `features/workflow/model`.
- Keep workflow domain contracts and schemas in a client/server-safe shared contract area.
- Keep workflow import/export adapters with the workflow feature, not in the domain contract.

Acceptance criteria:

- Every non-shared module has an obvious product owner.
- Contract modules contain no React, DOM, Node, Browserbase, or Playwright dependency.

## Phase 2 — Make state transitions explicit

### 2.1 Replace coordinated recorder setters with a reducer

Create a pure recorder-session reducer that consumes normalized actions:

```ts
type RecorderSessionAction =
  | { type: "transport.changed"; status: TransportStatus }
  | { type: "recording.start-requested" }
  | { type: "recording.started"; session: RecordingSession }
  | { type: "recording.stopped" }
  | { type: "browser.page-changed"; page: BrowserPage }
  | { type: "browser.navigation-failed"; message: string }
  | { type: "picker.opened"; picker: BrowserPicker }
  | { type: "captcha.changed"; pageId: string; status: CaptchaStatus }
  | { type: "replay.started"; replay: ReplayRun }
  | { type: "replay.step-changed"; result: ReplayStepResult }
  | { type: "replay.finished"; status: ReplayCompletion }
  | { type: "session.failed"; context: ErrorContext; message: string };
```

- Normalize each `ServerMessage` into one reducer action before it reaches state.
- Move pure transition logic and selectors out of the hook.
- Keep timers, sockets, focus management, and message sending in effects/adapters.
- Model session mode explicitly instead of inferring it from overlapping recording and replay statuses.
- Derive `displayStatus`, `displayError`, locks, button availability, and active replay result through selectors.
- Consolidate repeated session-reset behavior into reducer transitions.

Acceptance criteria:

- The reducer is deterministic and has transition-table tests.
- Impossible combinations are unrepresentable or rejected.
- `useRecorderSession` coordinates adapters and exposes commands; it does not contain a monolithic message switch plus many setter calls.

### 2.2 Normalize browser page, picker, and CAPTCHA state

- Use one active-page source of truth.
- Store per-page CAPTCHA information with page/session state rather than coordinating `activePageId`, `browserPage`, and a separate status map from the view.
- Represent date and select pickers as one discriminated `BrowserPicker` union.
- Keep transient completion notices separate from persistent session state.

Acceptance criteria:

- Switching pages clears or restores page-scoped overlays through one transition.
- Components cannot render both picker kinds at once.
- Active-page identity is not duplicated across independent state values.

### 2.3 Consolidate workspace overlay state

Replace `manualOpen`, `runDialogOpen`, `confirmation`, `pendingImport`, and `pendingReplayStartId` with one discriminated overlay state:

```ts
type WorkspaceOverlay =
  | { type: "none" }
  | { type: "manual-step" }
  | { type: "run-workflow"; startStepId?: string }
  | { type: "confirm-new" }
  | { type: "confirm-sensitive-export" }
  | { type: "confirm-import"; workflow: Workflow };
```

Acceptance criteria:

- Mutually exclusive dialogs cannot be open simultaneously.
- CAPTCHA locking closes overlays with one action.
- Pending data is owned by the overlay that requires it.

### 2.4 Keep workflow edits type-safe

- Add workflow commands for variant-safe edits: rename, enable, change payload, change target, change position, and change wait condition.
- Narrow on `step.type` before editing variant payloads.
- Stop casting arbitrary object spreads to `WorkflowStep`.
- Decide explicitly whether invalid intermediate form drafts are allowed:
  - if allowed, keep draft strings in editor-local form state and commit valid values;
  - if not allowed, reject the edit and show an inline validation message.

Acceptance criteria:

- `StepEditor` contains no `as WorkflowStep` casts.
- Reducer tests prove edits preserve the step discriminant and required payload.
- Export validation remains a final safety boundary, not the first place invalid editor state is discovered.

## Phase 3 — Split components by responsibility

### 3.1 Reduce `RecorderWorkspace`

Extract app-owned pieces:

- `WorkspaceLayout` for the three-panel shell and resizers.
- `WorkflowDialogs` for manual, run, import, new-workflow, and sensitive-export flows.
- `UndoStepToast` for deletion recovery.
- `useWorkspaceController` for orchestration and policy.

Keep feature components focused on rendering and intent callbacks.

Acceptance criteria:

- The workspace render tree is readable without tracing business logic.
- Import, export, replay-start, and new-recording flows have focused controller tests.

### 3.2 Reduce `BrowserPanel`

Extract:

- `BrowserChrome` and `BrowserAddress`.
- `LiveViewFrame`.
- `BrowserEmptyState`.
- `CaptchaOverlay`.
- `BrowserConnectionNotice`.
- browser-owned picker overlay host.

Use a small view-model prop instead of dozens of unrelated scalar props:

```ts
interface BrowserViewModel {
  page: BrowserPage | null;
  liveViewUrl: string | null;
  availability: BrowserAvailability;
  navigation: NavigationState;
  picker: BrowserPicker | null;
}
```

Acceptance criteria:

- Subcomponents have one clear rendering responsibility.
- Availability policy is computed outside JSX.
- Focus effects remain close to the element they control.

### 3.3 Split `StepEditor` into variant-aware sections

- `StepSummaryFields`.
- `StepPayloadEditor`, with a typed editor per action family.
- `TargetEditor`.
- `ViewportPositionEditor`.
- `ReplayWaitEditor`.
- `ReplayResultPanel`.

Acceptance criteria:

- Each action type exposes only valid fields.
- Target-less navigation steps do not pass through target update code.
- Wait and locator editors can be tested independently.

### 3.4 Remove duplicated navigation actions

- Extract shared import/export/replay action controls used by expanded and collapsed navbar variants.
- Preserve intent-based APIs such as `onImport`, `onExport`, and `onReplay`.
- Keep native `<button>`, `<input type="file">`, `<form>`, and `<select>` elements.

Acceptance criteria:

- Collapsed and expanded layouts share behavior without duplicating event code.
- Existing keyboard and accessibility coverage continues to pass.

## Phase 4 — Decompose protocol and server runtime

This phase follows the frontend state work because the new client boundaries reveal the protocol seams that should be preserved.

### 4.1 Split the protocol by message family

Create schemas for:

- transport envelope and sequencing;
- session lifecycle;
- browser navigation/page events;
- picker commands/events;
- CAPTCHA events;
- replay commands/status/results;
- recorded actions.

Compose these into the exported client and server unions.

Acceptance criteria:

- Existing wire messages remain compatible.
- Each message family has focused schema tests.
- Client features import only the contract family they consume.

### 4.2 Replace the server command chain with handlers

- Move custom Next/HTTP/WebSocket setup into server composition modules.
- Replace the long `if/else` command dispatch in `server.ts` with an exhaustive handler or switch that delegates by domain.
- Type the Next request handler directly and remove the `as never` bridge.
- Keep connection authentication/configuration and runtime lookup at the transport boundary.

Acceptance criteria:

- `server.ts` is an entry point, not the application implementation.
- Adding one command does not require editing unrelated command branches.
- Invalid-message handling and sequencing behavior are unchanged.

### 4.3 Split `RecordingRuntime` into collaborators

Extract behind narrow interfaces:

- `SessionLifecycle` for provider connect/release and disconnect grace periods.
- `PageRegistry` for active page, popup registration, frames, and page events.
- `RecorderInstaller` and `ActionForwarder`.
- `CaptchaCoordinator`.
- `PickerCoordinator`.
- `NavigationController`.
- `ReplayCoordinator`.
- `SequencedMessageBuffer`.

Keep `RecordingRuntime` temporarily as a facade so WebSocket handling and tests can migrate incrementally.

Acceptance criteria:

- The runtime facade delegates instead of owning every subsystem.
- Each collaborator has isolated lifecycle and cleanup tests.
- Release remains idempotent and clears all timers/listeners.

### 4.4 Split replay policy from orchestration

Extract:

- `preflightReplay`.
- frame resolution.
- locator candidate resolution.
- step execution.
- automatic network/DOM settling.
- explicit wait conditions.
- recovery state machine.

Inject clock/sleep behavior into settling and recovery tests instead of relying on real timers where practical.

Acceptance criteria:

- Locator resolution can change without touching run recovery.
- Settling policy has deterministic tests.
- The run orchestrator reads as a sequence of domain operations.

### 4.5 Convert the injected recorder into normal modules

- Move recorder logic into typed source modules grouped by event capture, target description, accessible naming, picker interception, navigation, and emission.
- Bundle those modules into the injected browser script during development/build.
- Keep the generated artifact out of hand-edited source.
- Run unit tests against pure helpers and E2E against the bundled script.

Acceptance criteria:

- Injected source is type-checked and linted as ordinary TypeScript.
- The runtime installs one generated script with unchanged browser behavior.
- Recorder fixture tests remain the compatibility suite.

## Phase 5 — Align tests with ownership

### 5.1 Co-locate focused unit tests

- Put reducer, selector, schema, and component tests beside their owners or mirror the feature structure under `tests/unit`.
- Split large suites by behavior:
  - navigation lifecycle;
  - page/popup management;
  - picker behavior;
  - CAPTCHA behavior;
  - replay locators;
  - replay settling;
  - replay recovery;
  - workflow editor components.

### 5.2 Add architecture tests

- Add an import-boundary check to CI.
- Add protocol compatibility fixtures for representative schema `1.0` workflows and WebSocket messages.
- Add an environment-config test matrix.
- Add reducer transition tests for every server event and user command.

### 5.3 Preserve E2E scope

- Keep local fixture-based E2E deterministic and free.
- Keep the paid Browserbase smoke test explicit and separately authorized.
- Continue accessibility scanning and minimum-width layout checks.

Acceptance criteria:

- Test filenames reveal feature ownership.
- A failing test points to one subsystem.
- Refactors can be performed without weakening protocol, recorder, replay, or accessibility coverage.

## Suggested implementation sequence

Phase 0 is implemented directly on `main` as reviewable local commits without opening or pushing a pull request:

1. Finalize and track this refactor plan.
2. Add Node/npm enforcement, the isolated Prettier baseline, verification scripts, CI, and related command documentation.
3. Add the validated server environment module, its unit tests, and server integration.

Continue later phases as focused pull requests:

1. App-owned workspace composition and feature public APIs.
2. Import-boundary lint rules and relocation of misplaced hooks/types.
3. Pure recorder-session reducer and selectors.
4. Browser page/picker/CAPTCHA state normalization.
5. Workspace overlay union.
6. Type-safe workflow edit commands and split `StepEditor`.
7. Split `BrowserPanel` and introduce app-composed recorder/replay controls.
8. Split protocol schemas without wire changes.
9. Server entry-point and command-router extraction.
10. `RecordingRuntime` collaborators.
11. Replay engine collaborators.
12. Typed/bundled injected recorder source.
13. Test-suite ownership cleanup.

Each later pull request should include only the tests and file moves needed for that seam. Avoid combining repository-wide renames, formatting, state redesign, and behavior changes.

## Completion checklist

### Foundation

- [ ] Node 24 and npm 11 major lines are selected and enforced.
- [ ] Clean install and one-command verification are documented.
- [ ] Formatting, linting, tests, build, and local E2E run in CI.
- [ ] Environment variables are validated once.
- [ ] Production build succeeds in a clean environment.

### Architecture

- [ ] `app` owns cross-feature composition.
- [ ] Every feature exposes a small public API.
- [ ] Feature internals are not imported across boundaries.
- [ ] Shared contracts are framework- and vendor-independent.
- [ ] Browserbase and Playwright remain behind server adapters.
- [ ] Import direction is automatically enforced.

### Components

- [ ] Workspace, browser panel, and step editor are split into focused units.
- [ ] Components receive intent-level view models and callbacks.
- [ ] Recorder and replay controls are not hard-coded inside browser presentation.
- [ ] Native accessible elements and current focus behavior are preserved.

### State and data flow

- [ ] Recorder lifecycle is represented by explicit reducer actions.
- [ ] Active page and picker state each have one source of truth.
- [ ] Workspace dialogs use one discriminated overlay state.
- [ ] Display locks and statuses are derived with selectors.
- [ ] Workflow edits do not bypass the discriminated union with casts.
- [ ] Timers, sockets, browser messages, downloads, and focus changes are isolated effects.

### Maintainability

- [ ] Protocol message families are independently owned and tested.
- [ ] Recording runtime and replay policies are decomposed behind interfaces.
- [ ] Injected browser code is normal typed source before bundling.
- [ ] Tests are organized by feature and behavior.
- [ ] Workflow schema `1.0` and existing wire behavior remain compatible.

## Deliberate non-goals

- Do not introduce a global state library solely to replace reducers.
- Do not add server-state tooling while workflows intentionally live only in the current tab.
- Do not add routing or URL state without a shareable navigation requirement.
- Do not change workflow persistence, authentication, collaboration, branching, or other documented MVP boundaries as part of this refactor.
- Do not redesign the visual system while changing ownership and state flow.
- Do not change the paid Browserbase execution policy.

## Expected outcome

After these phases, a new engineer should be able to locate a behavior by product domain, understand legal session transitions from a reducer, change one feature through its public API, verify the repository with one command, and remove a feature without editing unrelated internals. The refactor should improve change safety without changing the product users already have.