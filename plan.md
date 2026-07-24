# Browser Memory Recorder MVP — Build Plan

## Summary

Build a local-first, desktop web application that embeds a real Browserbase Live View, records semantic browser interactions, turns them into an editable in-memory workflow, and exports versioned JSON.

- Start from the currently empty repository using Node.js 24 LTS, npm, Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS.
- Use a small custom Node/WebSocket runtime alongside Next.js because Browserbase credentials and the persistent Playwright connection cannot safely run in the browser. This remains “frontend-first”: no database, authentication, durable backend, or workflow persistence.
- Keep Browserbase credentials server-only and provide `.env.example` for `BROWSERBASE_API_KEY`, optional `BROWSERBASE_PROJECT_ID`, region, and a 30-minute session timeout.
- Pin dependencies through `package-lock.json`; use Browserbase SDK, `playwright-core`, `ws`, Zod, dnd-kit, Lucide, Vitest, Testing Library, and Playwright Test.
- Document local setup, Browserbase usage/cost expectations, security implications, supported behavior, and test commands in the README.

## Architecture and Interfaces

Serve Next.js and `/ws` from one custom Node server. Keep workflows in React memory while the server holds only ephemeral Browserbase, Playwright, connection, and reconnect-buffer state. Use a vendor-neutral `BrowserProvider` interface for session creation, connection, Live View retrieval, and release. Release cloud sessions on Stop, replacement, disconnect timeout, and shutdown.

Inject a semantic recorder into every page and frame. Capture clicks, fills, changes, shortcuts, submissions, full navigation, and SPA navigation. Coalesce input, suppress redundant events, and generate ordered test-id, role/name, name, label, text, CSS, and XPath locator candidates. Support one active tab and an explicit popup-switch action.

Define a dependency-free workflow domain model as the shared compile-time contract between recording, editing, persistence, transport, and replay. Validate untrusted boundaries with a Zod schema at version `1.0` that is compile-time checked against that model and includes typed action payloads, page and frame metadata, ordered locator candidates, origin metadata, and sensitive-field marking. Capture values exactly—including passwords—and warn before exporting sensitive JSON.

## Product and UX Behavior

Create a light, Chrome-inspired desktop workspace with a toolbar, 320px workflow timeline, dominant Browserbase panel, and bottom details editor. Support explicit lifecycle states, editing during and after recording, manual step insertion, keyboard reordering, delete with Undo, inline validation, accessible loading/error/empty states, and a larger-screen message below 1024px.

## Implementation and Verification

1. Scaffold the Next.js/custom-server project and design system.
2. Implement workflow schemas, reducer, editing, validation, and export.
3. Implement Browserbase lifecycle, WebSocket reconnects, and recorder injection.
4. Build the timeline, browser panel, editor, and accessibility behavior.
5. Add unit, integration, component, local E2E, and opt-in Browserbase tests.

Completion requires typecheck, lint, unit/integration tests, production build, local E2E, accessibility scan, and an optional credentialed Browserbase smoke test.

## Assumptions and Boundaries

- The MVP is desktop-only and supports one active browser tab.
- The recorder runtime is ephemeral and local; there is no durable backend.
- Full input capture is intentional and exported workflows must be treated as secrets.
- Replay, persistence, authentication, collaboration, assertions, variables, branching, screenshots, and deployment are out of scope.
