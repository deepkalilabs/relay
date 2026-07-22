import type { Frame, Locator, Page } from "playwright-core";
import type { ReplayDiagnostic, ReplayStatus, ServerMessage } from "@/lib/protocol";
import {
  WorkflowSchema,
  orderLocatorCandidates,
  type LocatorCandidate,
  type TargetDescriptor,
  type Workflow,
  type WorkflowStep,
} from "@/lib/workflow/schema";

export const REPLAY_STEP_TIMEOUT_MS = 15_000;

export interface ReplayPreflight {
  workflow: Workflow;
  startIndex: number;
  totalSteps: number;
  bootstrapUrl?: string;
}

function validHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function preflightReplay(input: Workflow, startStepId?: string): ReplayPreflight {
  const parsed = WorkflowSchema.parse(input);
  const duplicate = parsed.steps.find((step, index) => parsed.steps.findIndex((candidate) => candidate.id === step.id) !== index);
  if (duplicate) throw new Error("Workflow step IDs must be unique before replay.");

  const startIndex = startStepId ? parsed.steps.findIndex((step) => step.id === startStepId) : 0;
  if (startIndex < 0) throw new Error("The selected replay step is no longer in this workflow.");
  const range = parsed.steps.slice(startIndex);
  const firstEnabled = range.find((step) => step.enabled);
  if (!firstEnabled) throw new Error("The selected replay range has no enabled steps.");

  const bootstrapUrl = firstEnabled.type === "navigate"
    ? undefined
    : validHttpUrl(parsed.source.startUrl)
      ? parsed.source.startUrl
      : validHttpUrl(firstEnabled.page.url)
        ? firstEnabled.page.url
        : undefined;
  if (firstEnabled.type !== "navigate" && !bootstrapUrl) {
    throw new Error(startStepId
      ? "Run from here needs a recorded HTTP page URL because replay uses a fresh browser."
      : "Replay needs a recorded HTTP page URL because replay uses a fresh browser.");
  }

  return { workflow: parsed, startIndex, totalSteps: range.length, bootstrapUrl };
}

interface ResolvedTarget {
  locator: Locator;
  kind: string;
  attempts: ReplayDiagnostic["attemptedLocators"];
}

function locatorFor(frame: Frame, candidate: LocatorCandidate): Locator {
  switch (candidate.kind) {
    case "testId":
      return frame.getByTestId(candidate.value);
    case "role":
      return frame.getByRole(candidate.value as Parameters<Frame["getByRole"]>[0], { name: candidate.name, exact: candidate.exact });
    case "accessibleName":
    case "label":
      return frame.getByLabel(candidate.value, { exact: candidate.exact });
    case "text":
      return frame.getByText(candidate.value, { exact: candidate.exact });
    case "css":
      return frame.locator(candidate.value);
    case "xpath":
      return frame.locator(`xpath=${candidate.value}`);
  }
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "The replay action could not be completed.";
  return error.message.split("\n")[0] || "The replay action could not be completed.";
}

async function resolveTarget(page: Page, target: TargetDescriptor): Promise<ResolvedTarget> {
  const frame = target.frameUrl
    ? page.frames().find((candidate) => candidate.url() === target.frameUrl)
    : page.mainFrame();
  if (!frame) {
    throw Object.assign(new Error("The recorded frame is not available on this page."), {
      attempts: [{ kind: "frame", reason: "Recorded frame URL was not found." }],
    });
  }

  const attempts: ReplayDiagnostic["attemptedLocators"] = [];
  const candidates = orderLocatorCandidates(target.candidates);
  const deadline = Date.now() + REPLAY_STEP_TIMEOUT_MS;
  do {
    attempts.splice(0);
    for (const candidate of candidates) {
      try {
        const locator = locatorFor(frame, candidate);
        const count = await locator.count();
        if (count !== 1) {
          attempts.push({ kind: candidate.kind, reason: count ? `Matched ${count} elements.` : "No match." });
          continue;
        }
        if (!await locator.isVisible()) {
          attempts.push({ kind: candidate.kind, reason: "The only match is not visible." });
          continue;
        }
        return { locator, kind: candidate.kind, attempts: [...attempts] };
      } catch (error) {
        attempts.push({ kind: candidate.kind, reason: errorMessage(error) });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);

  throw Object.assign(new Error("No locator resolved to one visible element within 15 seconds."), { attempts });
}

async function executeStep(page: Page, step: WorkflowStep): Promise<{ locatorKind?: string; attempts: ReplayDiagnostic["attemptedLocators"] }> {
  if (step.type === "navigate") {
    await page.goto(step.payload.url, { waitUntil: "domcontentloaded", timeout: REPLAY_STEP_TIMEOUT_MS });
    return { attempts: [] };
  }

  const resolved = await resolveTarget(page, step.target);
  const options = { timeout: REPLAY_STEP_TIMEOUT_MS };
  switch (step.type) {
    case "click":
      await resolved.locator.click(options);
      break;
    case "fill":
    case "set_date":
      await resolved.locator.fill(step.payload.value, options);
      break;
    case "select":
      try {
        await resolved.locator.selectOption({ value: step.payload.value }, options);
      } catch (error) {
        if (!step.payload.label) throw error;
        await resolved.locator.selectOption({ label: step.payload.label }, options);
      }
      break;
    case "check":
      await resolved.locator.check(options);
      break;
    case "uncheck":
      await resolved.locator.uncheck(options);
      break;
    case "keypress": {
      const chord = [...step.payload.modifiers, step.payload.key].join("+");
      await resolved.locator.press(chord, options);
      break;
    }
    case "submit": {
      const submitted = await resolved.locator.evaluate((element) => {
        if (element instanceof HTMLFormElement) {
          element.requestSubmit();
          return true;
        }
        const form = element instanceof HTMLElement ? element.closest("form") : null;
        if (form) form.requestSubmit();
        return Boolean(form);
      }, undefined, options);
      if (!submitted) throw new Error("The submit target is not inside a form.");
      break;
    }
  }
  return { locatorKind: resolved.kind, attempts: resolved.attempts };
}

type RecoveryDecision = "resume" | "retry" | "skip" | "stop";

export class ReplayEngine {
  private pauseRequested = false;
  private stopped = false;
  private waiting: ((decision: RecoveryDecision) => void) | null = null;
  private failed = false;
  private currentStepId: string | undefined;
  private currentIndex = 0;

  constructor(
    readonly runId: string,
    private readonly page: Page,
    private readonly preflight: ReplayPreflight,
    private readonly emit: (message: ServerMessage) => void,
  ) {}

  private status(status: ReplayStatus): void {
    this.emit({
      type: "replay.status",
      runId: this.runId,
      status,
      currentStepId: this.currentStepId,
      currentIndex: this.currentIndex,
      totalSteps: this.preflight.totalSteps,
    });
  }

  pause(): void {
    if (this.stopped || this.failed || this.waiting) return;
    this.pauseRequested = true;
    this.status("pausing");
  }

  resume(): void {
    this.pauseRequested = false;
    this.waiting?.("resume");
  }

  retry(): void {
    if (this.failed) this.waiting?.("retry");
  }

  skip(): void {
    if (this.failed) this.waiting?.("skip");
  }

  takeControl(): void {
    if (!this.failed) return;
    this.status("manual");
  }

  stop(): void {
    this.stopped = true;
    this.pauseRequested = false;
    this.waiting?.("stop");
  }

  private waitForDecision(): Promise<RecoveryDecision> {
    return new Promise((resolve) => {
      this.waiting = (decision) => {
        this.waiting = null;
        resolve(decision);
      };
    });
  }

  async run(): Promise<void> {
    this.status("running");
    if (this.preflight.bootstrapUrl) {
      await this.page.goto(this.preflight.bootstrapUrl, { waitUntil: "domcontentloaded", timeout: REPLAY_STEP_TIMEOUT_MS });
    }

    const steps = this.preflight.workflow.steps.slice(this.preflight.startIndex);
    for (let index = 0; index < steps.length && !this.stopped; index += 1) {
      const step = steps[index];
      this.currentIndex = index;
      this.currentStepId = step.id;

      if (!step.enabled) {
        this.emit({ type: "replay.step", runId: this.runId, stepId: step.id, status: "skipped" });
        continue;
      }

      if (this.pauseRequested) {
        this.status("paused");
        const decision = await this.waitForDecision();
        if (decision === "stop" || this.stopped) break;
        this.status("running");
      }

      let retry = true;
      while (retry && !this.stopped) {
        retry = false;
        this.failed = false;
        const startedAt = Date.now();
        this.emit({ type: "replay.step", runId: this.runId, stepId: step.id, status: "running" });
        this.status("running");
        try {
          const result = await executeStep(this.page, step);
          if (this.stopped) break;
          this.emit({
            type: "replay.step",
            runId: this.runId,
            stepId: step.id,
            status: "passed",
            durationMs: Date.now() - startedAt,
            locatorKind: result.locatorKind,
          });
        } catch (error) {
          if (this.stopped) break;
          this.failed = true;
          const attempts = "attempts" in Object(error) && Array.isArray((error as { attempts?: unknown }).attempts)
            ? (error as { attempts: ReplayDiagnostic["attemptedLocators"] }).attempts
            : [];
          this.emit({
            type: "replay.step",
            runId: this.runId,
            stepId: step.id,
            status: "failed",
            durationMs: Date.now() - startedAt,
            diagnostic: { message: errorMessage(error), attemptedLocators: attempts },
          });
          this.status("paused");
          const decision = await this.waitForDecision();
          if (decision === "retry" || decision === "resume") retry = true;
          if (decision === "skip") {
            this.emit({ type: "replay.step", runId: this.runId, stepId: step.id, status: "skipped" });
          }
          if (decision === "stop") this.stopped = true;
        }
      }
    }

    this.failed = false;
    if (!this.stopped) this.status("completed");
  }
}
