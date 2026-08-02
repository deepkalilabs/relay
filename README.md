# Browser Memory Recorder

Browser Memory Recorder turns a live browser session into an editable, locally saved automation blueprint. Use an embedded Browserbase browser normally, and the app records completed field edits, native dropdown selections, and semantic button clicks as structured workflow steps.

Each step can be reviewed, renamed, reordered, disabled, or deleted before the workflow is saved or exported as validated, versioned JSON. Saved workflows appear in the Library and can be reopened or replayed later.

## What it does

- Opens an interactive cloud browser through Browserbase Live View.
- Records browser activity as semantic actions rather than raw mouse coordinates.
- Builds ordered locator candidates from roles, labels, text, CSS, and XPath.
- Displays recorded actions immediately in an editable workflow timeline.
- Creates durable drafts and saves one JSON file per workflow.
- Lists locally saved drafts and completed workflows in the Library.
- Creates, edits, and permanently deletes reusable local profiles backed by one JSON file each.
- Supports reconnecting to an active recording after a short network interruption.
- Exports the completed workflow as portable JSON.
- Replays full workflows or starts from a selected deterministic step.
- Returns to recording after replay so workflows can be built and verified incrementally.
- Waits for DOM and network activity to settle between replayed actions, with optional per-step delay and element conditions.
- Pauses on failures with Retry, Skip, Take Control, and Stop recovery actions.

The current product foundation focuses on accurate capture, explicit local saving, review, interactive replay, and reusable local profiles. There is no autosave: leaving the editor discards changes made since the last successful Save. The active product direction is maintained in the [product roadmap](./docs/product/roadmap.md).

## How it works

```text
User interacts with Browserbase Live View
                    │
                    ▼
Injected recorder observes browser events
                    │
                    ▼
Playwright runtime normalizes and deduplicates actions
                    │
                    ▼
WebSocket sends semantic steps to the React workspace
                    │
                    ▼
User explicitly saves through the local workflow API
                    │
                    ▼
Atomic JSON file in .data/workflows
```

The React client owns unsaved edits while the editor is open. Route-private workspace modules under the workflow editor route compose the browser, recorder, replay, and workflow features through their public entry points. A custom Node server keeps Browserbase credentials out of the client, exposes the local workflow API, maintains the Playwright CDP connection, and streams sequenced recorder events over `/ws`.

## Repository structure

```text
browser_replay/
├── docs/
│   └── product/
│       ├── roadmap.md             # Active product direction and sequencing
│       └── mvp_design.md          # Historical MVP product specification
├── src/
│   ├── app/
│   │   ├── (product)/             # Product routes; group is omitted from URLs
│   │   │   ├── library/           # Local workflow Library route
│   │   │   ├── profile/           # Local profile library route
│   │   │   └── workflows/[workflowId]/edit/
│   │   │       ├── _components/   # Route-private workspace composition
│   │   │       └── _hooks/        # Route-private workspace policy
│   │   ├── (test-support)/fixture/ # Controlled pages used by E2E tests
│   │   ├── _styles/               # Global tokens, reset, and shared controls
│   │   └── layout.tsx             # Single Next.js root layout
│   ├── features/
│   │   ├── browser/               # Live View, overlays, hooks, and browser model
│   │   ├── recorder/              # Recorder components, model, and transport
│   │   ├── replay/                # Replay controls, recovery, and run dialog
│   │   ├── workflow-editor/       # Timeline, editing state, API, and export
│   │   ├── workflow-library/      # Saved-workflow library presentation
│   │   └── profile/               # Profile CRUD presentation and HTTP client
│   ├── shared/
│   │   ├── contracts/             # Profile, workflow, recording, and protocol contracts
│   │   └── ui/                    # Shared accessible UI primitives
│   └── server/
│       ├── infrastructure/browser/ # Browserbase adapter and provider port
│       ├── recording/
│       │   ├── deduplicate.ts     # Duplicate event suppression
│       │   ├── injected.ts        # Script installed in browser pages
│       │   └── runtime.ts         # Session, page, and event runtime
│       ├── replay/                # Replay engine and replay policies
│       ├── profiles/              # Profile filesystem repository and local HTTP API
│       └── workflows/             # Workflow filesystem repository and local HTTP API
├── tests/
│   ├── e2e/                       # Playwright workspace and browser tests
│   ├── components.test.tsx        # React component behavior
│   ├── recorder.test.ts           # Recorder normalization tests
│   └── workflow.test.ts           # Workflow store and schema tests
├── server.ts                      # Next.js HTTP and WebSocket server
├── plan.md                        # Architecture and delivery boundaries
├── master_design.md               # Extended design document
└── package.json                   # Commands and dependencies
```

Each feature exposes a small `index.ts` API. Route-private application composition may import those APIs, while feature internals use relative imports. Shared contracts are client/server-safe and do not depend on features. ESLint prevents deep cross-feature imports, lower layers from importing `app`, and client modules from importing server implementations.

## Workflow model

The dependency-free workflow contract lives in `src/shared/contracts/workflow`. It defines the workflow aggregate, named step variants, element targets, page context, replay waits, serialization, and metadata shared by the recorder, editor, persistence, protocol, and replay engine. Runtime validation is kept beside the contract and compile-time checked against the domain types. Client/server message schemas are split by direction under `src/shared/contracts/protocol`.

Saved workflows and new exports use schema version `1.2`, including `status`, `revision`, optional `finishedAt` lifecycle fields, and explicit input bindings on `fill` steps. Schema `1.0` and `1.1` files remain readable at compatibility boundaries and normalize with recorded-value bindings. A workflow also contains its Browserbase source, timestamps, and an ordered list of steps. Automatic recording produces `fill`, `set_date`, `select`, `click`, and Enter `keypress` steps. Manual steps and existing workflows continue to support:

```text
navigate · click · fill · select · check · uncheck · keypress · submit
```

`ElementTarget` keeps multiple locator candidates, ordered from semantic selectors to CSS and XPath fallbacks, rather than coupling replay to one selector. Metadata records whether a step was recorded or manually added, and whether its value may be sensitive.

Steps may also define an optional replay wait. A wait can add up to 30 seconds after an action and can require an element to remain visible or hidden before replay continues.

The Library can bind each enabled `fill` step to its recorded value, a fixed literal, a supported profile field, or a value requested at run time. Profile and run-time values are resolved into an ephemeral workflow before replay and are not written back to workflow files.

## Local workflow storage

The server stores each workflow as `.data/workflows/{workflowId}.json`. Writes use a same-directory temporary file followed by an atomic rename, and every explicit save checks the last loaded revision. If another save wins first, the editor keeps the local edits visible and offers to reload the saved version.

Set `WORKFLOW_DATA_DIR` to use another absolute or project-relative directory:

```bash
WORKFLOW_DATA_DIR=/path/to/workflows npm run dev
```

The Library API returns workflow names and ordered step names only. Full step payloads are loaded only when an editor route opens a specific workflow. Invalid files are skipped while valid workflows remain available.

## Local profile storage

Profiles are explicitly saved as `.data/profiles/{profileId}.json`. The first Save creates the file; later saves and permanent deletion require the last loaded revision so stale clients cannot silently replace or remove newer data. Writes use private permissions and same-directory atomic replacement.

Set `PROFILE_DATA_DIR` to use another absolute or project-relative directory:

```bash
PROFILE_DATA_DIR=/path/to/profiles npm run dev
```

The profile list API returns only names, Draft/Ready status, and update times. Identity and location values are loaded only for the selected profile. Incomplete profiles remain persistable drafts; Ready status is derived only when every field is present and the email is valid. Invalid files are skipped and surfaced as a non-sensitive count.

## Requirements

- Node.js 24 LTS (`nvm use` reads `.nvmrc`)
- npm
- A Browserbase account and API key

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add `BROWSERBASE_API_KEY` to `.env.local`, then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

For local development, `npm run dev` also loads an existing, gitignored `secret.txt` containing `BROWSERBASE_API_KEY=...`. This keeps the key out of tracked files and takes precedence over the empty `.env.local` template.

`BROWSERBASE_PROJECT_ID` is optional because Browserbase can infer it from the key. The custom server serves both Next.js and `/ws`, so use `npm run dev` instead of `next dev`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js and the recorder WebSocket in watch mode |
| `npm run build` | Create a production Next.js build |
| `npm start` | Run the production custom server |
| `npm run typecheck` | Check TypeScript without emitting files |
| `npm run lint` | Run ESLint with zero warnings allowed |
| `npm test` | Run the Vitest unit and component suite |
| `npm run test:changed` | Run tests affected by staged, unstaged, or untracked changes |
| `npm run ralph:plan -- "<goal>"` | Create and approve a small-increment Ralphex master plan |
| `npm run ralph:run -- docs/plans/<slug>.md` | Execute, review, and publish an approved plan one increment at a time |
| `npm run hooks:install` | Install the tracked pre-push ADR review hook |
| `npm run adr:review -- --none --reason "..."` | Review the committed branch diff before an authorized push |
| `npm run test:e2e` | Run local Playwright end-to-end tests |
| `npm run test:browserbase` | Run the paid Browserbase smoke test |

## Local Ralph loop

The personal Ralph loop runs Ralphex in Codex executor mode for planning,
implementation, and native multi-agent reviews. Ralphex skips its separate
external-review phase in this mode. A persistent localhost MCP service gives
each fresh Codex session read-only ast-grep search and TypeScript/JavaScript
SolidLSP navigation without restarting the language server between increments.

Install the host tools and Python environment once:

```bash
brew install umputun/apps/ralphex
uv sync
npm run hooks:install
codex login status
```

Run `codex login` first if the status command reports that Codex is signed out.
Codex loads the project-scoped `ralph-code-intel` server from
`.codex/config.toml` after the repository is trusted. The server is available
only while `ralph:run` is active and listens on `127.0.0.1:8765`.

Create a plan interactively, accept its draft, then exit when Ralphex offers
immediate execution:

```bash
npm run ralph:plan -- "add a small feature"
```

From a clean default branch, start the approved plan:

```bash
npm run ralph:run -- docs/plans/20260730-add-a-small-feature.md
```

Starting this command authorizes its task commits and non-force pushes only to
the generated `codex/<plan-slug>` branch. Each increment is implemented,
validated with `test:changed`, reviewed by Ralphex's Codex agents, ADR-reviewed,
and pushed before the next begins. The command stops without pushing when tests
or reviews fail, the worktree is dirty, the branch diverges, or the remote
branch moves. Re-run the same command on the generated branch to resume. Merge
and pull request creation remain manual.

## Security and session lifecycle

- Browserbase credentials remain in the local server environment.
- All entered values are captured, including passwords, tokens, and payment fields.
- Sensitive steps are marked but are not automatically redacted.
- Recorded payloads are written to local workflow JSON only after Save or Finish and are never written to server logs.
- Local workflow files can contain passwords, tokens, and payment values in plain text; protect the workflow data directory like other secrets.
- Local profile files contain identity and location information in plain text; protect the profile data directory like other personal data.
- Exported JSON is plain text and should be handled like a secret.
- Automatic CAPTCHA solving is enabled for recording and replay sessions. During recording, detected challenges temporarily lock local browser input while Browserbase solves them; replay remains unchanged and CAPTCHA lifecycle events stay available in server diagnostics.
- Sessions are released on Stop, disconnect timeout, replacement, or server shutdown.
- The default Browserbase session timeout is 30 minutes and may incur usage charges.

This app is intended for local development or long-running Node hosting. The persistent WebSocket and Playwright connections used by recording and replay make it unsuitable for serverless deployment.

## Current product boundaries

The product supports a single active tab, with an explicit prompt when a popup opens. It is a desktop workspace intended for viewports at least 1024 pixels wide.

Replay remains linear and single-tab. Authentication, assertions, variables, persisted failure evidence, secret management, unattended execution, collaboration, and production deployment are not part of the current foundation. Workflow Library lifecycle actions and profile-parameterized runs are planned next. Profiles currently store identity and location values only.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

The E2E suite uses controlled pages under `/fixture` and includes an accessibility scan. The Browserbase smoke test requires a real API key and creates a paid remote session:

```bash
BROWSERBASE_API_KEY=... npm run test:browserbase
```

For current product direction, see [docs/product/roadmap.md](./docs/product/roadmap.md). For implementation and architecture context, see [tasks/plan.md](./tasks/plan.md), [Refactor_plan.md](./Refactor_plan.md), and the historical [docs/product/mvp_design.md](./docs/product/mvp_design.md).
