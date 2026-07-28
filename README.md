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
- Supports reconnecting to an active recording after a short network interruption.
- Exports the completed workflow as portable JSON.
- Replays full workflows or starts from a selected deterministic step.
- Returns to recording after replay so workflows can be built and verified incrementally.
- Waits for DOM and network activity to settle between replayed actions, with optional per-step delay and element conditions.
- Pauses on failures with Retry, Skip, Take Control, and Stop recovery actions.

The current MVP focuses on accurate capture, explicit local saving, review, and interactive replay. There is no autosave: leaving the editor discards changes made since the last successful Save.

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
│       └── mvp_design.md          # Product and interaction specification
├── src/
│   ├── app/
│   │   ├── (product)/             # Product routes; group is omitted from URLs
│   │   │   ├── library/           # Local workflow Library route
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
│   │   └── profile/               # Profile presentation
│   ├── shared/
│   │   ├── contracts/             # Workflow, recording, and protocol contracts
│   │   └── ui/                    # Shared accessible UI primitives
│   └── server/
│       ├── infrastructure/browser/ # Browserbase adapter and provider port
│       ├── recording/
│       │   ├── deduplicate.ts     # Duplicate event suppression
│       │   ├── injected.ts        # Script installed in browser pages
│       │   └── runtime.ts         # Session, page, and event runtime
│       ├── replay/                # Replay engine and replay policies
│       └── workflows/             # Filesystem repository and local HTTP API
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

Saved workflows and new exports use schema version `1.1`, including `status`, `revision`, and optional `finishedAt` lifecycle fields. Schema `1.0` files remain readable at compatibility boundaries and normalize as completed revision-1 workflows. A workflow also contains its Browserbase source, timestamps, and an ordered list of steps. Automatic recording produces `fill`, `set_date`, `select`, and `click` steps. Manual steps and existing workflows continue to support:

```text
navigate · click · fill · select · check · uncheck · keypress · submit
```

`ElementTarget` keeps multiple locator candidates, ordered from semantic selectors to CSS and XPath fallbacks, rather than coupling replay to one selector. Metadata records whether a step was recorded or manually added, and whether its value may be sensitive.

Steps may also define an optional replay wait. A wait can add up to 30 seconds after an action and can require an element to remain visible or hidden before replay continues.

## Local workflow storage

The server stores each workflow as `.data/workflows/{workflowId}.json`. Writes use a same-directory temporary file followed by an atomic rename, and every explicit save checks the last loaded revision. If another save wins first, the editor keeps the local edits visible and offers to reload the saved version.

Set `WORKFLOW_DATA_DIR` to use another absolute or project-relative directory:

```bash
WORKFLOW_DATA_DIR=/path/to/workflows npm run dev
```

The Library API returns workflow names and ordered step names only. Full step payloads are loaded only when an editor route opens a specific workflow. Invalid files are skipped while valid workflows remain available.

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
| `npm run test:e2e` | Run local Playwright end-to-end tests |
| `npm run test:browserbase` | Run the paid Browserbase smoke test |

## Security and session lifecycle

- Browserbase credentials remain in the local server environment.
- All entered values are captured, including passwords, tokens, and payment fields.
- Sensitive steps are marked but are not automatically redacted.
- Recorded payloads are written to local workflow JSON only after Save or Finish and are never written to server logs.
- Local workflow files can contain passwords, tokens, and payment values in plain text; protect the workflow data directory like other secrets.
- Exported JSON is plain text and should be handled like a secret.
- Automatic CAPTCHA solving is enabled for recording and replay sessions. During recording, detected challenges temporarily lock local browser input while Browserbase solves them; replay remains unchanged and CAPTCHA lifecycle events stay available in server diagnostics.
- Sessions are released on Stop, disconnect timeout, replacement, or server shutdown.
- The default Browserbase session timeout is 30 minutes and may incur usage charges.

This app is intended for local development or long-running Node hosting. The persistent WebSocket and Playwright connections used by recording and replay make it unsuitable for serverless deployment.

## MVP boundaries

The MVP supports a single active tab, with an explicit prompt when a popup opens. It is a desktop workspace intended for viewports at least 1024 pixels wide.

Authentication, collaboration, assertions, variables, branching, persisted screenshots, secret management, autosave, and production deployment are intentionally out of scope. Replay remains linear and single-tab. Library deletion, duplication, rename, import, export, and Run actions are also deferred.

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

For deeper product and architecture context, see [plan.md](./plan.md) and [docs/product/mvp_design.md](./docs/product/mvp_design.md).
