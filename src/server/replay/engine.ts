import type { Frame, Locator, Page, Request } from "playwright-core";
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
export const UI_SETTLE_QUIET_MS = 500;
export const UI_SETTLE_MAX_MS = 5_000;
export const WAIT_CONDITION_STABLE_MS = 300;
const WAIT_POLL_MS = 50;

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
      ? "Run from here needs a recorded HTTP page URL as its starting point."
      : "Replay needs a recorded HTTP page URL as its starting point.");
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

function normalizedFrameUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.origin}${pathname}`;
  } catch {
    return null;
  }
}

export async function resolveTarget(page: Page, target: TargetDescriptor, recordedPageUrl?: string): Promise<ResolvedTarget> {
  const frame = resolveFrame(page, target.frameUrl, recordedPageUrl);
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

function resolveFrame(page: Page, frameUrl?: string, recordedPageUrl?: string): Frame {
  const mainFrame = page.mainFrame();
  let frame: Frame | undefined;
  if (!frameUrl) {
    frame = mainFrame;
  } else {
    const recordedFrame = normalizedFrameUrl(frameUrl);
    const recordedPage = recordedPageUrl ? normalizedFrameUrl(recordedPageUrl) : null;
    const currentMain = normalizedFrameUrl(mainFrame.url());
    if (
      (recordedFrame && recordedPage && recordedFrame === recordedPage) ||
      mainFrame.url() === frameUrl ||
      (recordedFrame && currentMain === recordedFrame)
    ) {
      frame = mainFrame;
    } else {
      const childFrames = page.frames().filter((candidate) => candidate !== mainFrame);
      const exact = childFrames.filter((candidate) => candidate.url() === frameUrl);
      if (exact.length === 1) frame = exact[0];
      else if (exact.length > 1) {
        throw Object.assign(new Error("Multiple frames match the recorded frame URL."), {
          attempts: [{ kind: "frame", reason: "Recorded frame URL matched multiple frames." }],
        });
      } else if (recordedFrame) {
        const normalized = childFrames.filter((candidate) => normalizedFrameUrl(candidate.url()) === recordedFrame);
        if (normalized.length === 1) frame = normalized[0];
        else if (normalized.length > 1) {
          throw Object.assign(new Error("Multiple frames match the recorded frame address."), {
            attempts: [{ kind: "frame", reason: "Recorded frame origin and path matched multiple frames." }],
          });
        }
      }
    }
  }
  if (!frame) {
    throw Object.assign(new Error("The recorded frame is not available on this page."), {
      attempts: [{ kind: "frame", reason: "Recorded frame URL was not found." }],
    });
  }
  return frame;
}

async function executeStep(page: Page, step: WorkflowStep): Promise<{ locatorKind?: string; attempts: ReplayDiagnostic["attemptedLocators"] }> {
  if (step.type === "navigate") {
    await page.goto(step.payload.url, { waitUntil: "domcontentloaded", timeout: REPLAY_STEP_TIMEOUT_MS });
    return { attempts: [] };
  }

  const resolved = await resolveTarget(page, step.target, step.page.url);
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
type ReplayPhase = "acting" | "settling" | "waiting";

class ReplayStoppedError extends Error {
  constructor() {
    super("Replay stopped.");
  }
}

export class ReplayEngine {
  private pauseRequested = false;
  private stopped = false;
  private waiting: ((decision: RecoveryDecision) => void) | null = null;
  private failed = false;
  private currentStepId: string | undefined;
  private currentIndex = 0;
  private readonly activeRequests = new Set<Request>();
  private lastNetworkActivity = 0;

  constructor(
    readonly runId: string,
    private readonly page: Page,
    private readonly preflight: ReplayPreflight,
    private readonly emit: (message: ServerMessage) => void,
  ) {}

  private readonly onRequest = (request: Request): void => {
    if (["eventsource", "websocket"].includes(request.resourceType())) return;
    this.activeRequests.add(request);
    this.lastNetworkActivity = Date.now();
  };

  private readonly onRequestDone = (request: Request): void => {
    if (!this.activeRequests.delete(request)) return;
    this.lastNetworkActivity = Date.now();
  };

  private startActivityTracking(): boolean {
    const events = this.page as unknown as {
      on?: (event: string, listener: (request: Request) => void) => void;
      off?: (event: string, listener: (request: Request) => void) => void;
    };
    if (typeof events.on !== "function" || typeof events.off !== "function") return false;
    events.on("request", this.onRequest);
    events.on("requestfinished", this.onRequestDone);
    events.on("requestfailed", this.onRequestDone);
    return true;
  }

  private stopActivityTracking(): void {
    const events = this.page as unknown as { off?: (event: string, listener: (request: Request) => void) => void };
    if (typeof events.off !== "function") return;
    events.off("request", this.onRequest);
    events.off("requestfinished", this.onRequestDone);
    events.off("requestfailed", this.onRequestDone);
    this.activeRequests.clear();
  }

  private async sleep(durationMs: number): Promise<void> {
    const deadline = Date.now() + durationMs;
    while (Date.now() < deadline) {
      if (this.stopped) throw new ReplayStoppedError();
      await new Promise((resolve) => setTimeout(resolve, Math.min(WAIT_POLL_MS, Math.max(0, deadline - Date.now()))));
    }
    if (this.stopped) throw new ReplayStoppedError();
  }

  private stopAware<T>(operation: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (callback: () => void) => {
        if (timer) clearTimeout(timer);
        callback();
      };
      const checkStopped = () => {
        if (this.stopped) {
          finish(() => reject(new ReplayStoppedError()));
          return;
        }
        timer = setTimeout(checkStopped, WAIT_POLL_MS);
      };
      operation.then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
      checkStopped();
    });
  }

  private async resetDomActivity(): Promise<boolean> {
    const candidate = this.page as unknown as { evaluate?: Page["evaluate"] };
    if (typeof candidate.evaluate !== "function") return false;
    try {
      await this.page.evaluate(() => {
        type MutationState = { lastMutation: number; observer: MutationObserver };
        const host = window as Window & { __browserMemoryReplayMutationState?: MutationState };
        const existing = host.__browserMemoryReplayMutationState;
        if (existing) {
          existing.lastMutation = performance.now();
          return;
        }
        const state: MutationState = {
          lastMutation: performance.now(),
          observer: new MutationObserver(() => { state.lastMutation = performance.now(); }),
        };
        state.observer.observe(document.documentElement, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true,
        });
        host.__browserMemoryReplayMutationState = state;
      });
      return true;
    } catch {
      return false;
    }
  }

  private async domIsQuiet(): Promise<boolean | null> {
    try {
      const result = await this.page.evaluate((quietMs) => {
        const host = window as Window & { __browserMemoryReplayMutationState?: { lastMutation: number } };
        const state = host.__browserMemoryReplayMutationState;
        return Boolean(state && performance.now() - state.lastMutation >= quietMs);
      }, UI_SETTLE_QUIET_MS);
      return typeof result === "boolean" ? result : null;
    } catch {
      return null;
    }
  }

  private async waitForAutomaticSettle(networkTracked: boolean): Promise<void> {
    const evaluateAvailable = typeof (this.page as unknown as { evaluate?: unknown }).evaluate === "function";
    if (!evaluateAvailable && !networkTracked) return;
    const deadline = Date.now() + UI_SETTLE_MAX_MS;
    const waitForLoadState = (this.page as unknown as { waitForLoadState?: Page["waitForLoadState"] }).waitForLoadState;
    if (typeof waitForLoadState === "function") {
      try {
        await this.stopAware(this.page.waitForLoadState("domcontentloaded", { timeout: UI_SETTLE_MAX_MS }));
      } catch (error) {
        if (error instanceof ReplayStoppedError) throw error;
      }
    }
    if (this.stopped) throw new ReplayStoppedError();
    let domTracked = await this.resetDomActivity();
    const settleStarted = Date.now();
    this.lastNetworkActivity = Math.max(this.lastNetworkActivity, settleStarted);
    while (Date.now() < deadline) {
      if (this.stopped) throw new ReplayStoppedError();
      const domState = domTracked ? await this.domIsQuiet() : null;
      if (domState === null) domTracked = false;
      const domQuiet = !domTracked || domState === true;
      const networkQuiet = !networkTracked || (
        this.activeRequests.size === 0 && Date.now() - this.lastNetworkActivity >= UI_SETTLE_QUIET_MS
      );
      if (domQuiet && networkQuiet) return;
      await this.sleep(Math.min(WAIT_POLL_MS, Math.max(0, deadline - Date.now())));
    }
  }

  private async locatorHasVisibleMatch(locator: Locator, count: number): Promise<boolean> {
    for (let index = 0; index < count; index += 1) {
      const candidate = count === 1 ? locator : locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) return true;
    }
    return false;
  }

  private async waitConditionState(
    target: TargetDescriptor,
    state: "visible" | "hidden",
    recordedPageUrl: string,
  ): Promise<void> {
    const deadline = Date.now() + REPLAY_STEP_TIMEOUT_MS;
    let stableSince: number | null = null;
    let attempts: ReplayDiagnostic["attemptedLocators"] = [];
    while (Date.now() < deadline) {
      if (this.stopped) throw new ReplayStoppedError();
      const nextAttempts: ReplayDiagnostic["attemptedLocators"] = [];
      let anyVisible = false;
      let frameAvailable = true;
      let candidateEvaluated = false;
      try {
        const frame = resolveFrame(this.page, target.frameUrl, recordedPageUrl);
        for (const candidate of orderLocatorCandidates(target.candidates)) {
          try {
            const locator = locatorFor(frame, candidate);
            const count = await locator.count();
            candidateEvaluated = true;
            const visible = count > 0 && await this.locatorHasVisibleMatch(locator, count);
            anyVisible ||= visible;
            nextAttempts.push({
              kind: candidate.kind,
              reason: visible ? `Matched ${count} visible element${count === 1 ? "" : "s"}.` : count ? "Matches are hidden." : "No match.",
            });
          } catch (error) {
            nextAttempts.push({ kind: candidate.kind, reason: errorMessage(error) });
          }
        }
      } catch (error) {
        frameAvailable = false;
        nextAttempts.push({ kind: "frame", reason: errorMessage(error) });
      }
      attempts = nextAttempts;
      const satisfied = frameAvailable && candidateEvaluated && (state === "visible" ? anyVisible : !anyVisible);
      if (satisfied) {
        stableSince ??= Date.now();
        if (Date.now() - stableSince >= WAIT_CONDITION_STABLE_MS) return;
      } else {
        stableSince = null;
      }
      await this.sleep(WAIT_POLL_MS);
    }
    throw Object.assign(
      new Error(`Wait condition did not remain ${state} within 15 seconds.`),
      { attempts },
    );
  }

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
    const networkTracked = this.startActivityTracking();
    try {
      this.status("running");
      if (this.preflight.bootstrapUrl) {
        this.lastNetworkActivity = Date.now();
        await this.page.goto(this.preflight.bootstrapUrl, { waitUntil: "domcontentloaded", timeout: REPLAY_STEP_TIMEOUT_MS });
        await this.waitForAutomaticSettle(networkTracked);
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

        const startedAt = Date.now();
        let phase: ReplayPhase = "acting";
        let actionResult: Awaited<ReturnType<typeof executeStep>> | null = null;
        let actionCompleted = false;
        let settleCompleted = false;
        let delayCompleted = false;
        let stepFinished = false;
        while (!stepFinished && !this.stopped) {
          this.failed = false;
          this.emit({ type: "replay.step", runId: this.runId, stepId: step.id, status: "running", phase });
          this.status("running");
          try {
            if (!actionCompleted) {
              phase = "acting";
              this.lastNetworkActivity = Date.now();
              actionResult = await executeStep(this.page, step);
              actionCompleted = true;
            }
            if (!settleCompleted) {
              phase = "settling";
              this.emit({ type: "replay.step", runId: this.runId, stepId: step.id, status: "running", phase });
              await this.waitForAutomaticSettle(networkTracked);
              settleCompleted = true;
            }
            if (step.waitAfter && !delayCompleted) {
              phase = "waiting";
              this.emit({ type: "replay.step", runId: this.runId, stepId: step.id, status: "running", phase });
              await this.sleep(step.waitAfter.delayMs ?? 0);
              delayCompleted = true;
            }
            if (step.waitAfter?.condition) {
              phase = "waiting";
              this.emit({ type: "replay.step", runId: this.runId, stepId: step.id, status: "running", phase });
              await this.waitConditionState(step.waitAfter.condition.target, step.waitAfter.condition.state, step.page.url);
            }
            if (this.stopped) break;
            this.emit({
              type: "replay.step",
              runId: this.runId,
              stepId: step.id,
              status: "passed",
              durationMs: Date.now() - startedAt,
              locatorKind: actionResult?.locatorKind,
            });
            stepFinished = true;
          } catch (error) {
            if (this.stopped || error instanceof ReplayStoppedError) break;
            this.failed = true;
            const attempts = "attempts" in Object(error) && Array.isArray((error as { attempts?: unknown }).attempts)
              ? (error as { attempts: ReplayDiagnostic["attemptedLocators"] }).attempts
              : [];
            this.emit({
              type: "replay.step",
              runId: this.runId,
              stepId: step.id,
              status: "failed",
              phase,
              durationMs: Date.now() - startedAt,
              diagnostic: { message: errorMessage(error), attemptedLocators: attempts },
            });
            this.status("paused");
            const decision = await this.waitForDecision();
            if (decision === "retry" || decision === "resume") continue;
            if (decision === "skip") {
              this.emit({ type: "replay.step", runId: this.runId, stepId: step.id, status: "skipped" });
              stepFinished = true;
            }
            if (decision === "stop") this.stopped = true;
          }
        }
      }

      this.failed = false;
      if (!this.stopped) this.status("completed");
    } finally {
      this.stopActivityTracking();
    }
  }
}
