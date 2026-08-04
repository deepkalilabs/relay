# Feature Spec: Assertion Steps v1

- Status: Implemented
- Last updated: 2026-08-03

## Objective

Let a user add a non-mutating workflow step that verifies the current page state during replay. Assertions are manually authored checks, not recorded browser actions.

Version one supports:

- **Visible** — one stored locator candidate resolves to exactly one visible element.
- **Text contains** — the same unique visible target has visible text containing an expected phrase after trimming, collapsing whitespace, and lowercasing both values.

## Authoring Experience

The timeline add control opens an **Action** or **Assertion** chooser. Actions continue to use the manual-action dialog. Assertions require an active recording session because their target must be selected in the live browser; there is no CSS-only fallback.

While picking, the injected recorder highlights the hovered element and shows a nonblocking selection notice. The selection click is captured before page and recording handlers, so it neither activates the website nor produces an action. Escape cancels the picker. Selection also cancels when CAPTCHA protection starts, the page or session changes, or replay begins.

The picker captures the same semantic locator evidence used by recording, plus frame URL, page context, viewport position, display name, and normalized visible text. The confirmation editor infers **Text contains** when text is available and **Visible** otherwise. Users can edit the name and expectation before inserting the step after the current selection.

The inspector keeps locator candidates editable. Assertion steps show expectation controls but do not show action payload, parameter-binding, or post-action wait controls.

## Replay Semantics

Assertions apply their captured viewport position and evaluate once. They do not use the action resolver's retry window, poll for a future state, mutate the page, or trigger post-step settling.

Replay tries stored locator candidates in priority order and retains diagnostics for candidates that fail before resolution or exhaustion. A check passes only when a candidate resolves to exactly one visible element. Missing, hidden, and ambiguous targets fail immediately. Text containment then compares:

```ts
normalize(actual).includes(normalize(expected))
```

`normalize` trims, collapses whitespace, and lowercases. It does not remove punctuation or reorder words. A mismatch reports the normalized expected and observed text. Locator failures retain attempted-locator diagnostics. Retry performs a fresh immediate evaluation; Skip, Take control, and Stop use the existing replay recovery behavior.

## Contract and Compatibility

Canonical workflow schema `1.3` adds the assertion step family:

```ts
type AssertionExpectation =
  | { kind: "visible" }
  | { kind: "text_contains"; expected: string };

type AssertionStep = ElementWorkflowStepBase & {
  type: "assertion";
  expectation: AssertionExpectation;
};

type WorkflowStep = ActionStep | AssertionStep;
```

Assertions are excluded from `RecordedAction`, `WorkflowActionType`, parameter binding, recorder deduplication, and action waits. Expected text must contain a non-whitespace character and cannot exceed 1,000 characters. Schema `1.2` workflows and non-fill schema `1.0`/`1.1` workflows normalize to `1.3` in memory and are rewritten only on their next save. Schema `1.0`/`1.1` workflows containing fill steps are rejected.

The picker protocol uses request-correlated `assertion.pick.start`, `assertion.pick.cancel`, `assertion.pick.selected`, and `assertion.pick.cancelled` messages. Replay exposes the `asserting` phase to the UI.

## Data and Safety

Expected and observed text remain plain in workflow storage, exports, UI, and replay diagnostics. Assertions must not capture passwords, tokens, payment details, personal data, or other secrets. Future evidence capture must treat assertion text as potentially sensitive even though version one does not redact it.

## Non-goals

- URL, title, attribute, numeric, or visual assertions.
- Polling, configurable assertion timeouts, or eventual-state checks.
- Assertion creation without a live recording session.
- Secret redaction or a secret-management system.
- Branching, conditional execution, or assertion-driven page mutation.

ADR 0012 records the step-family, schema, picker-protocol, and evaluation decisions. ADR 0013 records the breaking legacy-fill compatibility boundary.
