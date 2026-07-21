import type { Browser, BrowserContext, Page } from "playwright-core";
import type { WebSocket } from "ws";
import { RecordedActionSchema, type RecordedAction } from "@/lib/workflow/recorded-action";
import type { ServerMessage, SequencedServerMessage } from "@/lib/protocol";
import type { BrowserProvider } from "@/server/provider/types";
import { RECORDER_BINDING, RECORDER_SCRIPT } from "@/server/recorder/injected";
import { ActionDeduplicator } from "@/server/recorder/deduplicate";
import { orderLocatorCandidates } from "@/lib/workflow/schema";

interface PageState {
  id: string;
  page: Page;
  index: number;
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
  return action.type === "fill" || action.type === "click";
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

  async start(options: { timeoutSeconds: number; region: "us-west-2" | "us-east-1" | "eu-central-1" | "ap-southeast-1" }): Promise<void> {
    if (this.sessionId) return;
    this.emit({ type: "session.status", status: "starting" });
    try {
      const created = await this.provider.createSession(options);
      this.sessionId = created.id;
      const connected = await this.provider.connect(created.id);
      this.browser = connected.browser;
      this.context = connected.context;

      await this.context.exposeBinding(RECORDER_BINDING, async ({ page }, raw: unknown) => {
      const state = this.pages.get(page);
      if (!state || state.id !== this.activePageId) return;
      const parsed = RecordedActionSchema.omit({ page: true, recordedAt: true }).safeParse(raw);
      if (!parsed.success) return;
      await this.forwardAction({
        ...parsed.data,
        page: { id: state.id, url: page.url(), title: await page.title().catch(() => undefined) },
        recordedAt: new Date().toISOString(),
      });
      });
      await this.context.addInitScript({ content: RECORDER_SCRIPT });

      for (const [index, page] of this.context.pages().entries()) await this.registerPage(page, index, index === 0);
      this.context.on("page", (page) => void this.registerPage(page, this.pages.size, false));

      const liveView = await this.provider.getLiveView(created.id, 0);
      const first = [...this.pages.values()][0];
      if (!first) throw new Error("Browserbase opened without a page.");
      this.activePageId = first.id;
      this.emit({ type: "session.started", sessionId: created.id, liveViewUrl: liveView.liveViewUrl, pageId: first.id });
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
      if (failedSessionId) await this.provider.releaseSession(failedSessionId);
      throw error;
    }
  }

  private async registerPage(page: Page, index: number, active: boolean): Promise<void> {
    const state: PageState = { id: crypto.randomUUID(), page, index };
    this.pages.set(page, state);
    if (active || !this.activePageId) this.activePageId = state.id;

    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame() || state.id !== this.activePageId) return;
      void this.emitPageState(state);
      if (page.url() === "about:blank") return;
      void this.forwardAction({
        type: "navigate",
        name: `Navigate to ${page.url()}`,
        payload: { url: page.url() },
        sensitive: false,
        page: { id: state.id, url: page.url() },
        recordedAt: new Date().toISOString(),
      });
    });
    page.on("domcontentloaded", () => {
      if (state.id === this.activePageId) void this.emitPageState(state);
    });
    page.on("close", () => {
      this.pages.delete(page);
      if (this.activePageId === state.id) this.activePageId = [...this.pages.values()][0]?.id ?? null;
    });

    await page.evaluate(RECORDER_SCRIPT).catch(() => undefined);
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

  private async forwardAction(action: RecordedAction): Promise<void> {
    if (!isAutomaticallyRecordableAction(action)) return;
    const normalized = action.target
      ? { ...action, target: { ...action.target, candidates: orderLocatorCandidates(action.target.candidates) } }
      : action;
    if (!this.deduplicator.shouldForward(normalized)) return;
    this.emit({ type: "recorded.action", action: normalized });
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

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.emit({ type: "session.status", status: "stopping" });
    const sessionId = this.sessionId;
    this.sessionId = null;
    await this.browser?.close().catch(() => undefined);
    if (sessionId) await this.provider.releaseSession(sessionId);
    this.emit({ type: "session.status", status: "stopped" });
    this.onReleased();
  }
}
