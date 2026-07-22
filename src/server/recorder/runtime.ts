import type { Browser, BrowserContext, Frame, Page } from "playwright-core";
import type { WebSocket } from "ws";
import { z } from "zod";
import { RecordedActionSchema, type RecordedAction } from "@/lib/workflow/recorded-action";
import type { ServerMessage, SequencedServerMessage } from "@/lib/protocol";
import type { BrowserProvider } from "@/server/provider/types";
import { RECORDER_BINDING, RECORDER_SCRIPT } from "@/server/recorder/injected";
import { ActionDeduplicator } from "@/server/recorder/deduplicate";
import { orderLocatorCandidates, TargetDescriptorSchema, type TargetDescriptor } from "@/lib/workflow/schema";
import type { Workflow } from "@/lib/workflow/schema";
import { preflightReplay, ReplayEngine } from "@/server/replay/engine";

interface PageState {
  id: string;
  page: Page;
  index: number;
}

const DatePickerBrowserEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("date-picker.request"),
    selector: z.string().min(1),
    name: z.string().min(1),
    target: TargetDescriptorSchema,
    value: z.string(),
    min: z.string(),
    max: z.string(),
    rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  }),
  z.object({ type: z.literal("date-picker.dismiss") }),
]);

interface PendingDatePicker {
  requestId: string;
  pageState: PageState;
  frame: Frame;
  selector: string;
  name: string;
  target: TargetDescriptor;
  min: string;
  max: string;
}

export function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter a web address to navigate.");
  const hasHttpScheme = /^https?:\/\//i.test(trimmed);
  const hasUnsupportedScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) && !hasHttpScheme && !/^[^/:]+:\d+(?:[/?#]|$)/.test(trimmed);
  if (hasUnsupportedScheme) throw new Error("Use an HTTP or HTTPS web address.");
  const candidate = hasHttpScheme ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Use an HTTP or HTTPS web address.");
  }
  return url.toString();
}

export function isAutomaticallyRecordableAction(action: RecordedAction): boolean {
  return action.type === "fill" || action.type === "click" || action.type === "set_date";
}

export function isRecordableNavigationUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidDateValue(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export class RecordingRuntime {
  socket: WebSocket | null = null;
  graceTimer: NodeJS.Timeout | null = null;
  readonly buffer: SequencedServerMessage[] = [];
  sequence: number;
  sessionId: string | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages = new Map<Page, PageState>();
  private activePageId: string | null = null;
  private readonly deduplicator = new ActionDeduplicator();
  private pendingDatePicker: PendingDatePicker | null = null;
  private mode: "recording" | "replay" | null = null;
  private recordingReady = false;
  private startUrlSource: "observed" | "requested" | null = null;
  private hasRecordedAction = false;
  private replayEngine: ReplayEngine | null = null;
  private replayMeta: { runId: string; totalSteps: number } | null = null;
  private replayTask: Promise<void> | null = null;
  private replayStopRequested = false;
  private released = false;

  constructor(
    readonly clientId: string,
    private readonly provider: BrowserProvider,
    private readonly onReleased: () => void,
    startingSequence = 0,
  ) {
    this.sequence = startingSequence;
  }

  attach(socket: WebSocket, lastSequence: number): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    this.socket = socket;
    const earliest = this.buffer[0]?.sequence ?? this.sequence;
    if (lastSequence < earliest - 1) this.sendDirect({ type: "buffer.gap", earliestSequence: earliest });
    for (const item of this.buffer) {
      if (item.sequence > lastSequence) socket.send(JSON.stringify(item));
    }
  }

  detach(): void {
    this.socket = null;
    if (this.graceTimer || this.released) return;
    this.graceTimer = setTimeout(() => void this.release(), 15_000);
  }

  emit(message: ServerMessage): void {
    const envelope: SequencedServerMessage = { sequence: ++this.sequence, message };
    this.buffer.push(envelope);
    if (this.buffer.length > 1_000) this.buffer.shift();
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(envelope));
  }

  private sendDirect(message: ServerMessage): void {
    this.emit(message);
  }

  private async installRecorder(context: BrowserContext): Promise<void> {
    await context.exposeBinding(RECORDER_BINDING, async ({ page, frame }, raw: unknown) => {
      const state = this.pages.get(page);
      if (!state || state.id !== this.activePageId) return;
      const dateEvent = DatePickerBrowserEventSchema.safeParse(raw);
      if (dateEvent.success) {
        await this.handleDatePickerBrowserEvent(state, frame, dateEvent.data);
        return;
      }
      const parsed = RecordedActionSchema.omit({ page: true, recordedAt: true }).safeParse(raw);
      if (!parsed.success) return;
      await this.forwardAction({
        ...parsed.data,
        page: { id: state.id, url: page.url(), title: await page.title().catch(() => undefined) },
        recordedAt: new Date().toISOString(),
      });
    });
    await context.addInitScript({ content: RECORDER_SCRIPT });
  }

  async start(options: { timeoutSeconds: number; region: "us-west-2" | "us-east-1" | "eu-central-1" | "ap-southeast-1" }): Promise<void> {
    if (this.sessionId) return;
    this.emit({ type: "session.status", status: "starting" });
    this.mode = "recording";
    this.recordingReady = false;
    this.startUrlSource = null;
    this.hasRecordedAction = false;
    try {
      const created = await this.provider.createSession(options);
      this.sessionId = created.id;
      const connected = await this.provider.connect(created.id);
      this.browser = connected.browser;
      this.context = connected.context;
      await this.installRecorder(this.context);

      for (const [index, page] of this.context.pages().entries()) await this.registerPage(page, index, index === 0, true);
      this.context.on("page", (page) => void this.registerPage(page, this.pages.size, false, true));

      const liveView = await this.provider.getLiveView(created.id, 0);
      const first = [...this.pages.values()][0];
      if (!first) throw new Error("Browserbase opened without a page.");
      this.activePageId = first.id;
      this.emit({ type: "session.started", sessionId: created.id, liveViewUrl: liveView.liveViewUrl, pageId: first.id });
      this.recordingReady = true;
      this.forwardStartUrl(first);
      await this.emitPageState(first);
      this.emit({ type: "session.status", status: "recording" });
    } catch (error) {
      const failedSessionId = this.sessionId;
      this.sessionId = null;
      await this.browser?.close().catch(() => undefined);
      this.browser = null;
      this.context = null;
      this.pages.clear();
      this.activePageId = null;
      this.mode = null;
      this.recordingReady = false;
      this.startUrlSource = null;
      this.hasRecordedAction = false;
      if (failedSessionId) await this.provider.releaseSession(failedSessionId);
      throw error;
    }
  }

  private async registerPage(page: Page, index: number, active: boolean, installRecorder: boolean): Promise<void> {
    const state: PageState = { id: crypto.randomUUID(), page, index };
    this.pages.set(page, state);
    if (active || !this.activePageId) this.activePageId = state.id;

    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame() || state.id !== this.activePageId) return;
      void this.emitPageState(state);
      this.dismissDatePickersForPage(state);
      this.forwardStartUrl(state);
    });
    page.on("domcontentloaded", () => {
      if (state.id === this.activePageId) void this.emitPageState(state);
    });
    page.on("close", () => {
      this.dismissDatePickersForPage(state);
      this.pages.delete(page);
      if (this.activePageId === state.id) this.activePageId = [...this.pages.values()][0]?.id ?? null;
    });

    if (installRecorder) await page.evaluate(RECORDER_SCRIPT).catch(() => undefined);
    if (!active && this.sessionId) {
      await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
      this.emit({
        type: "popup.detected",
        pageId: state.id,
        title: await page.title().catch(() => "New tab"),
        url: page.url(),
      });
    }
  }

  private dismissDatePickersForPage(state: PageState): void {
    if (this.pendingDatePicker?.pageState !== state) return;
    const { requestId } = this.pendingDatePicker;
    this.pendingDatePicker = null;
    this.emit({ type: "date.picker.closed", requestId });
  }

  private async handleDatePickerBrowserEvent(
    state: PageState,
    frame: Frame,
    event: z.infer<typeof DatePickerBrowserEventSchema>,
  ): Promise<void> {
    if (event.type === "date-picker.dismiss") {
      this.dismissDatePickersForPage(state);
      return;
    }

    this.dismissDatePickersForPage(state);
    const requestId = crypto.randomUUID();
    const locator = frame.locator(event.selector);
    const box = await locator.boundingBox().catch(() => null) ?? event.rect;
    const viewport = await state.page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    const pending: PendingDatePicker = {
      requestId,
      pageState: state,
      frame,
      selector: event.selector,
      name: event.name,
      target: event.target,
      min: event.min,
      max: event.max,
    };
    this.pendingDatePicker = pending;
    this.emit({
      type: "date.picker.open",
      requestId,
      value: event.value,
      min: event.min,
      max: event.max,
      rect: box,
      viewport,
    });
  }

  async selectDate(requestId: string, value: string): Promise<void> {
    const pending = this.pendingDatePicker;
    if (!pending || pending.requestId !== requestId) return;
    this.pendingDatePicker = null;
    this.emit({ type: "date.picker.closed", requestId });

    if (!isValidDateValue(value)) {
      throw new Error("Choose a valid calendar date.");
    }
    if (isValidDateValue(pending.min) && value < pending.min) throw new Error(`Choose a date on or after ${pending.min}.`);
    if (isValidDateValue(pending.max) && value > pending.max) throw new Error(`Choose a date on or before ${pending.max}.`);
    if (pending.pageState.id !== this.activePageId || pending.pageState.page.isClosed()) return;

    const locator = pending.frame.locator(pending.selector);
    await locator.fill(value);
    await locator.dispatchEvent("input");
    await locator.dispatchEvent("change");
    await this.forwardAction({
      type: "set_date",
      name: pending.name,
      target: pending.target,
      payload: { value },
      sensitive: false,
      page: {
        id: pending.pageState.id,
        url: pending.pageState.page.url(),
        title: await pending.pageState.page.title().catch(() => undefined),
      },
      recordedAt: new Date().toISOString(),
    });
  }

  dismissDatePicker(requestId: string): void {
    if (this.pendingDatePicker?.requestId !== requestId) return;
    this.pendingDatePicker = null;
    this.emit({ type: "date.picker.closed", requestId });
  }

  private async forwardAction(action: RecordedAction): Promise<void> {
    if (this.mode !== "recording" || !this.recordingReady) return;
    if (!isAutomaticallyRecordableAction(action)) return;
    if (!this.startUrlSource) {
      if (!this.forwardStartUrlDescriptor(action.page)) return;
    }
    const normalized = action.target
      ? { ...action, target: { ...action.target, candidates: orderLocatorCandidates(action.target.candidates) } }
      : action;
    if (!this.deduplicator.shouldForward(normalized)) return;
    this.emit({ type: "recorded.action", action: normalized });
    this.hasRecordedAction = true;
  }

  private forwardStartUrl(state: PageState): boolean {
    return this.forwardStartUrlDescriptor({ id: state.id, url: state.page.url() });
  }

  private forwardStartUrlDescriptor(page: RecordedAction["page"], source: "observed" | "requested" = "observed"): boolean {
    if (this.mode !== "recording" || !this.recordingReady) return false;
    if (this.startUrlSource === "requested") return true;
    if (this.startUrlSource === "observed" && (source === "observed" || this.hasRecordedAction)) return true;
    if (!isRecordableNavigationUrl(page.url)) return false;
    this.emit({ type: "recording.startUrl", url: page.url });
    this.startUrlSource = source;
    return true;
  }

  private async emitPageState(state: PageState): Promise<void> {
    this.emit({
      type: "browser.page",
      pageId: state.id,
      title: await state.page.title().catch(() => "Browser"),
      url: state.page.url(),
    });
  }

  private activePage(): PageState {
    const state = [...this.pages.values()].find((candidate) => candidate.id === this.activePageId);
    if (!state) throw new Error("The active browser page is not available.");
    return state;
  }

  private async runNavigation(operation: (page: Page) => Promise<unknown>): Promise<void> {
    try {
      const state = this.activePage();
      await operation(state.page);
      await this.emitPageState(state);
    } catch (error) {
      this.emit({
        type: "browser.navigation.error",
        message: error instanceof Error ? error.message : "The browser could not complete that navigation.",
      });
    }
  }

  async navigate(url: string): Promise<void> {
    let normalized: string;
    try {
      normalized = normalizeBrowserUrl(url);
    } catch (error) {
      this.emit({
        type: "browser.navigation.error",
        message: error instanceof Error ? error.message : "Enter a valid web address.",
      });
      return;
    }
    if (this.mode === "recording" && this.recordingReady) {
      const state = this.activePage();
      this.forwardStartUrlDescriptor({ id: state.id, url: normalized }, "requested");
    }
    await this.runNavigation((page) => page.goto(normalized, { waitUntil: "domcontentloaded", timeout: 30_000 }));
  }

  async goBack(): Promise<void> {
    await this.runNavigation((page) => page.goBack({ waitUntil: "domcontentloaded", timeout: 30_000 }));
  }

  async goForward(): Promise<void> {
    await this.runNavigation((page) => page.goForward({ waitUntil: "domcontentloaded", timeout: 30_000 }));
  }

  async reload(): Promise<void> {
    await this.runNavigation((page) => page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }));
  }

  async switchPage(pageId: string): Promise<void> {
    if (!this.sessionId) return;
    const state = [...this.pages.values()].find((candidate) => candidate.id === pageId);
    if (!state) throw new Error("That browser tab is no longer open.");
    this.activePageId = pageId;
    const liveView = await this.provider.getLiveView(this.sessionId, state.index);
    this.emit({ type: "popup.switched", pageId, liveViewUrl: liveView.liveViewUrl });
    await this.emitPageState(state);
  }

  async startReplay(
    workflow: Workflow,
    startStepId: string | undefined,
    options: { timeoutSeconds: number; region: "us-west-2" | "us-east-1" | "eu-central-1" | "ap-southeast-1" },
  ): Promise<void> {
    if (this.replayEngine || this.mode === "replay") throw new Error("A replay is already running.");
    const preflight = preflightReplay(workflow, startStepId);
    const runId = crypto.randomUUID();
    const existingSessionId = this.sessionId;
    const createdForReplay = !existingSessionId;
    this.mode = "replay";
    this.recordingReady = false;
    this.replayStopRequested = false;
    this.replayMeta = { runId, totalSteps: preflight.totalSteps };
    this.emit({ type: "replay.status", runId, status: "preparing", totalSteps: preflight.totalSteps });
    try {
      if (!existingSessionId) {
        const created = await this.provider.createSession(options);
        this.sessionId = created.id;
        const connected = await this.provider.connect(created.id);
        this.browser = connected.browser;
        this.context = connected.context;
        await this.installRecorder(this.context);
        for (const [index, page] of this.context.pages().entries()) await this.registerPage(page, index, index === 0, true);
        this.context.on("page", (page) => void this.registerPage(page, this.pages.size, false, true));
        this.startUrlSource = "requested";
        this.hasRecordedAction = workflow.steps.length > 0;
      }

      if (!this.sessionId) throw new Error("The recorder browser session is not available.");
      const active = this.activePageId ? this.activePage() : [...this.pages.values()][0];
      if (!active) throw new Error("Browserbase opened without a page.");
      this.activePageId = active.id;
      const liveView = await this.provider.getLiveView(this.sessionId, active.index);
      this.emit({
        type: "replay.started",
        runId,
        sessionId: this.sessionId,
        liveViewUrl: liveView.liveViewUrl,
        pageId: active.id,
        totalSteps: preflight.totalSteps,
      });
      await this.emitPageState(active);
      this.replayEngine = new ReplayEngine(runId, active.page, preflight, (message) => this.emit(message));
      const replayTask = this.replayEngine.run();
      this.replayTask = replayTask;
      void replayTask.then(() => {
        if (!this.replayStopRequested) this.returnToRecording(runId);
      }).catch((error) => {
        if (!this.replayMeta || this.replayMeta.runId !== runId) return;
        this.emit({ type: "replay.status", runId, status: "stopped", totalSteps: preflight.totalSteps });
        this.emit({
          type: "server.error",
          code: "REPLAY_ERROR",
          message: error instanceof Error ? error.message : "Replay could not continue.",
          recoverable: true,
        });
        this.returnToRecording(runId);
      });
    } catch (error) {
      if (createdForReplay) {
        const failedSessionId = this.sessionId;
        this.sessionId = null;
        await this.browser?.close().catch(() => undefined);
        this.browser = null;
        this.context = null;
        this.pages.clear();
        this.activePageId = null;
        this.mode = null;
        this.startUrlSource = null;
        this.hasRecordedAction = false;
        if (failedSessionId) await this.provider.releaseSession(failedSessionId);
      } else {
        this.mode = "recording";
        this.recordingReady = true;
        this.emit({ type: "session.status", status: "recording" });
      }
      this.replayEngine = null;
      this.replayMeta = null;
      this.replayTask = null;
      throw error;
    }
  }

  private returnToRecording(runId: string): void {
    if (this.released || !this.sessionId || this.replayMeta?.runId !== runId) return;
    this.mode = "recording";
    this.recordingReady = true;
    this.replayEngine = null;
    this.replayMeta = null;
    this.replayTask = null;
    this.replayStopRequested = false;
    this.emit({ type: "session.status", status: "recording" });
  }

  pauseReplay(): void { this.replayEngine?.pause(); }
  resumeReplay(): void { this.replayEngine?.resume(); }
  retryReplay(): void { this.replayEngine?.retry(); }
  skipReplay(): void { this.replayEngine?.skip(); }
  takeControlOfReplay(): void { this.replayEngine?.takeControl(); }

  async stopReplay(): Promise<void> {
    const replayMeta = this.replayMeta;
    const replayTask = this.replayTask;
    if (!replayMeta || !this.replayEngine) return;
    this.replayStopRequested = true;
    this.emit({ type: "replay.status", runId: replayMeta.runId, status: "stopping", totalSteps: replayMeta.totalSteps });
    this.replayEngine.stop();
    await replayTask?.catch(() => undefined);
    if (this.released || this.replayMeta?.runId !== replayMeta.runId) return;
    this.emit({ type: "replay.status", runId: replayMeta.runId, status: "stopped", totalSteps: replayMeta.totalSteps });
    this.returnToRecording(replayMeta.runId);
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    const replayMeta = this.replayMeta;
    if (replayMeta) {
      this.emit({ type: "replay.status", runId: replayMeta.runId, status: "stopping", totalSteps: replayMeta.totalSteps });
    }
    this.emit({ type: "session.status", status: "stopping" });
    this.replayStopRequested = true;
    this.replayEngine?.stop();
    const sessionId = this.sessionId;
    this.pendingDatePicker = null;
    this.sessionId = null;
    await this.browser?.close().catch(() => undefined);
    if (sessionId) await this.provider.releaseSession(sessionId);
    if (replayMeta) {
      this.emit({ type: "replay.status", runId: replayMeta.runId, status: "stopped", totalSteps: replayMeta.totalSteps });
    }
    this.emit({ type: "session.status", status: "stopped" });
    this.mode = null;
    this.recordingReady = false;
    this.startUrlSource = null;
    this.hasRecordedAction = false;
    this.replayEngine = null;
    this.replayMeta = null;
    this.replayTask = null;
    this.replayStopRequested = false;
    this.onReleased();
  }
}
