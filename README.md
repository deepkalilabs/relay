# Browser Memory Recorder

Browser Memory Recorder turns a live browser session into an editable automation blueprint. Use an embedded Browserbase browser normally, and the app records completed field edits, native dropdown selections, and semantic button clicks as structured workflow steps.

Each step can be reviewed, renamed, reordered, disabled, or deleted before the workflow is exported as validated, versioned JSON. The current tree can be replayed at any point in the active recorder session, then extended with more recorded actions.

## What it does

- Opens an interactive cloud browser through Browserbase Live View.
- Records browser activity as semantic actions rather than raw mouse coordinates.
- Builds ordered locator candidates from roles, labels, text, CSS, and XPath.
- Displays recorded actions immediately in an editable workflow timeline.
- Supports reconnecting to an active recording after a short network interruption.
- Exports the completed workflow as portable JSON.
- Imports schema `1.0` workflow JSON without server-side file persistence.
- Replays full workflows or starts from a selected deterministic step.
- Returns to recording after replay so workflows can be built and verified incrementally.
- Waits for DOM and network activity to settle between replayed actions, with optional per-step delay and element conditions.
- Pauses on failures with Retry, Skip, Take Control, and Stop recovery actions.

The current MVP focuses on accurate capture, review, and local interactive replay. It does not store workflows permanently.

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
User edits the timeline and exports validated JSON
```

The React client owns the workflow while the page is open. A custom Node server keeps Browserbase credentials out of the client, maintains the Playwright CDP connection, and streams sequenced recorder events over `/ws`.

## Repository structure

```text
browser_replay/
├── docs/
│   └── product/
│       └── mvp_design.md          # Product and interaction specification
├── src/
│   ├── app/
│   │   ├── fixture/               # Controlled pages used by E2E tests
│   │   ├── globals.css            # Global tokens, reset, and shared controls
│   │   ├── layout.tsx             # Next.js root layout
│   │   └── page.tsx               # Application entry page
│   ├── components/
│   │   └── ui/                    # Shared accessible UI primitives
│   ├── features/
│   │   ├── browser/               # Browserbase Live View and browser styles
│   │   ├── recorder/              # App shell, session controller, and panel layout
│   │   └── workflow/              # Timeline, step editor, dialogs, and styles
│   ├── hooks/
│   │   └── use-recorder-socket.ts # WebSocket lifecycle and recovery
│   ├── lib/
│   │   ├── protocol.ts            # Client/server message schemas
│   │   ├── recorder-session.ts    # Shared recorder presentation state
│   │   └── workflow/
│   │       ├── export.ts          # JSON serialization and download
│   │       ├── recorded-action.ts # Recorder-event conversion
│   │       ├── schema.ts          # Zod workflow model and locators
│   │       └── store.ts           # Timeline reducer and edit operations
│   └── server/
│       ├── provider/
│       │   ├── browserbase.ts     # Browserbase session adapter
│       │   └── types.ts           # Provider interfaces
│       └── recorder/
│           ├── deduplicate.ts     # Duplicate event suppression
│           ├── injected.ts        # Script installed in browser pages
│           └── runtime.ts         # Session, page, and event runtime
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

## Workflow model

Exports use schema version `1.0`. A workflow contains its Browserbase source, timestamps, and an ordered list of steps. Automatic recording produces `fill`, `set_date`, `select`, and `click` steps. Manual steps and existing workflows continue to support:

```text
navigate · click · fill · select · check · uncheck · keypress · submit
```

Element actions include multiple locator candidates, ordered from semantic selectors to CSS and XPath fallbacks. Metadata records whether a step was recorded or manually added, and whether its value may be sensitive.

Steps may also define an optional replay wait. A wait can add up to 30 seconds after an action and can require an element to remain visible or hidden before replay continues. Workflows without replay waits remain valid schema `1.0` files.

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
- Recorded payloads are not written to server logs or durable storage.
- Exported JSON is plain text and should be handled like a secret.
- Automatic CAPTCHA solving is enabled for recording and replay sessions. During recording, detected challenges temporarily lock local browser input while Browserbase solves them; replay remains unchanged and CAPTCHA lifecycle events stay available in server diagnostics.
- Sessions are released on Stop, disconnect timeout, replacement, or server shutdown.
- The default Browserbase session timeout is 30 minutes and may incur usage charges.

This app is intended for local development or long-running Node hosting. The persistent WebSocket and Playwright connections used by recording and replay make it unsuitable for serverless deployment.

## MVP boundaries

The MVP supports a single active tab, with an explicit prompt when a popup opens. It is a desktop workspace intended for viewports at least 1024 pixels wide.

Persistence, authentication, collaboration, assertions, variables, branching, screenshots, secret management, and production deployment are intentionally out of scope. Replay remains linear and single-tab.

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
