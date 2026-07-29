# Future Feature: Profile-Parameterized Workflow Runs

- Status: Planned — current roadmap initiative
- Last updated: 2026-07-29

## Summary

Allow a saved workflow to reuse values from a selected profile when it runs. A user should be able to keep a default value on each eligible step, optionally map that step to a profile field, and choose a profile before starting the workflow.

The Library currently contains a UI-only prototype of this experience. Its values and mappings exist only in local component state, reset when another workflow is selected, and do not affect saved workflows or replay.

## Problem

Recorded workflows currently contain the values entered during recording. Reusing the same workflow for another person or context requires editing those values manually. Profiles already represent reusable user information, but workflow steps cannot reference them.

## Goals

- Show the default value for every parameterizable step.
- Let the user map an eligible step to a supported profile field.
- Preserve the default value as an explicit fallback.
- Let the user choose a profile when starting a workflow.
- Resolve mapped values before replay without changing the saved default values.
- Explain missing profile data before opening a browser session.

## Non-goals

- Free-form expressions or template syntax.
- Conditional steps, loops, or data transformations.
- Secret management or credential injection.
- Remote profile storage or profile sharing.
- Parameterizing actions that do not carry a value.

## Proposed Experience

### Configure steps

The Library Steps section uses three columns:

1. **Step** — sequence number and step name.
2. **Default value** — an editable value used when no profile field applies.
3. **Use profile field** — either `Recorded value` or a supported profile field.

Actions without a value display `No value` and cannot be parameterized.

### Choose a profile

`Run with profile` opens a searchable profile picker. Each option shows the profile name and readiness state. Selecting a profile starts the normal run flow with that profile as the parameter source.

### Validate before replay

Before a browser session starts, the application checks every enabled mapped step. If a required profile value is missing, the run stays blocked and identifies the fields that need attention. A successful resolution produces an in-memory workflow for replay; it must not overwrite saved defaults.

## Implementation Stages

1. **Domain contract**
   - Define which step types can be parameterized.
   - Define stable identifiers for supported profile fields.
   - Decide how default values and profile references are represented in versioned workflow files.

2. **Persistence**
   - Load the full selected workflow without exposing step values in Library summaries.
   - Save parameter mappings through the existing revision-protected workflow boundary.
   - Preserve compatibility with older workflow files.

3. **Run flow**
   - Load and search saved profile summaries.
   - Resolve the selected profile into an ephemeral replay workflow.
   - Keep profile values out of workflow persistence and replay diagnostics.

4. **Failure handling**
   - Handle missing fields, draft profiles, save conflicts, deleted profiles, and profile-load failures.
   - Prevent browser-session creation until parameter validation succeeds.

## Initial Scope Decisions

- Parameterize `fill` steps first; other value-bearing step types require a later scoped decision.
- Use the existing profile fields as the initial supported vocabulary.
- Treat the latest edited default as the fallback value; the UI should call this `Default value`, not `Recorded value`.
- Allow a draft profile to run when every field referenced by the workflow is valid and present.
- Do not add date, select-option, or phone-format transformations in the initial increment.
- Do not remember the most recently used profile in the initial increment.

Any decision that changes workflow storage, schema compatibility, privacy boundaries, or replay protocols requires an ADR before implementation.

## Success Criteria

- A saved mapping survives reload without copying profile values into the workflow.
- One workflow can run with different profiles while retaining the same defaults.
- Missing mapped values stop the run before a browser session is created.
- Removing a mapping restores the step's default value.
- Profile values are not written to workflow files or included in diagnostics.
- Existing workflows without mappings continue to load and run unchanged.
