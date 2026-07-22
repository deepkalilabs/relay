import { describe, expect, it, vi } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { ClientMessageSchema } from "@/lib/protocol";
import { hideLiveViewNavbar, selectLiveViewPage } from "@/server/provider/browserbase";
import type { BrowserProvider } from "@/server/provider/types";
import { isRecordableNavigationUrl, normalizeBrowserUrl, RecordingRuntime } from "@/server/recorder/runtime";
import { createWorkflow } from "@/lib/workflow/schema";

describe("browser navigation", () => {
  it("normalizes scheme-less addresses and rejects unsafe protocols", () => {
    expect(normalizeBrowserUrl("example.com/path")).toBe("https://example.com/path");
    expect(normalizeBrowserUrl("http://example.com")).toBe("http://example.com/");
    expect(normalizeBrowserUrl("localhost:3000/path")).toBe("https://localhost:3000/path");
    expect(() => normalizeBrowserUrl("javascript:alert(1)")).toThrow(/http or https/i);
    expect(() => normalizeBrowserUrl("   ")).toThrow(/web address/i);
    expect(isRecordableNavigationUrl("https://example.com")).toBe(true);
    expect(isRecordableNavigationUrl("about:blank")).toBe(false);
  });

  it("stores an already-loaded page as the start URL without recording a navigate action", async () => {
    let currentUrl = "https://example.com/start";
    const mainFrame = {};
    const goto = vi.fn(async () => { currentUrl = "https://resolved.example.net/"; return null; });
    const page = {
      evaluate: vi.fn(async () => undefined),
      goto,
      mainFrame: vi.fn(() => mainFrame),
      on: vi.fn(),
      title: vi.fn(async () => "Example"),
      url: vi.fn(() => currentUrl),
    } as unknown as Page;
    const context = {
      addInitScript: vi.fn(async () => undefined),
      exposeBinding: vi.fn(async () => undefined),
      on: vi.fn(),
      pages: vi.fn(() => [page]),
    } as unknown as BrowserContext;
    const provider: BrowserProvider = {
      connect: vi.fn(async () => ({ browser: { close: vi.fn(async () => undefined) } as unknown as Browser, context })),
      createSession: vi.fn(async () => ({ id: "session", connectUrl: "ws://example.com" })),
      getLiveView: vi.fn(async () => ({ id: "page", title: "Example", url: currentUrl, liveViewUrl: "https://example.com/live" })),
      releaseSession: vi.fn(async () => undefined),
    };
    const runtime = new RecordingRuntime(crypto.randomUUID(), provider, vi.fn());
    await runtime.start({ timeoutSeconds: 120, region: "us-west-2" });

    const startedIndex = runtime.buffer.findIndex((item) => item.message.type === "session.started");
    const startUrl = runtime.buffer.find((item) => item.message.type === "recording.startUrl");
    expect(startUrl?.message).toEqual({ type: "recording.startUrl", url: currentUrl });
    expect(runtime.buffer.indexOf(startUrl!)).toBeGreaterThan(startedIndex);
    expect(runtime.buffer.some((item) => item.message.type === "recorded.action")).toBe(false);

    await runtime.navigate("pasted.example.com/path");
    const startUrls = runtime.buffer.flatMap((item) => item.message.type === "recording.startUrl" ? [item.message.url] : []);
    expect(startUrls).toEqual(["https://example.com/start", "https://pasted.example.com/path"]);
    expect(currentUrl).toBe("https://resolved.example.net/");
  });

  it("stores the start URL before the first injected action when the navigation event was missed", async () => {
    let currentUrl = "about:blank";
    const mainFrame = {};
    let binding: ((source: { page: Page; frame: unknown }, raw: unknown) => Promise<void>) | undefined;
    const page = {
      evaluate: vi.fn(async () => undefined),
      mainFrame: vi.fn(() => mainFrame),
      on: vi.fn(),
      title: vi.fn(async () => "Example"),
      url: vi.fn(() => currentUrl),
    } as unknown as Page;
    const context = {
      addInitScript: vi.fn(async () => undefined),
      exposeBinding: vi.fn(async (_name: string, callback: typeof binding) => { binding = callback; }),
      on: vi.fn(),
      pages: vi.fn(() => [page]),
    } as unknown as BrowserContext;
    const provider: BrowserProvider = {
      connect: vi.fn(async () => ({ browser: { close: vi.fn(async () => undefined) } as unknown as Browser, context })),
      createSession: vi.fn(async () => ({ id: "session", connectUrl: "ws://example.com" })),
      getLiveView: vi.fn(async () => ({ id: "page", title: "New Tab", url: currentUrl, liveViewUrl: "https://example.com/live" })),
      releaseSession: vi.fn(async () => undefined),
    };
    const runtime = new RecordingRuntime(crypto.randomUUID(), provider, vi.fn());
    await runtime.start({ timeoutSeconds: 120, region: "us-west-2" });
    runtime.buffer.splice(0);

    currentUrl = "https://example.com/form";
    await binding?.({ page, frame: mainFrame }, {
      type: "click",
      name: "Click Continue",
      target: { candidates: [{ kind: "role", value: "button", name: "Continue", exact: true }] },
      sensitive: false,
    });

    expect(runtime.buffer.map((item) => item.message.type)).toEqual(["recording.startUrl", "recorded.action"]);
    expect(runtime.buffer[0].message).toEqual({ type: "recording.startUrl", url: currentUrl });
    expect(runtime.buffer[1].message).toMatchObject({ type: "recorded.action", action: { type: "click" } });
  });

  it("stores only the first main-frame URL while ignoring later navigations", async () => {
    let currentUrl = "about:blank";
    const mainFrame = {};
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const page = {
      evaluate: vi.fn(async () => undefined),
      mainFrame: vi.fn(() => mainFrame),
      on: vi.fn((name: string, handler: (...args: unknown[]) => void) => { handlers.set(name, handler); }),
      title: vi.fn(async () => "Example"),
      url: vi.fn(() => currentUrl),
    } as unknown as Page;
    const context = {
      addInitScript: vi.fn(async () => undefined),
      exposeBinding: vi.fn(async () => undefined),
      on: vi.fn(),
      pages: vi.fn(() => [page]),
    } as unknown as BrowserContext;
    const provider: BrowserProvider = {
      connect: vi.fn(async () => ({ browser: { close: vi.fn(async () => undefined) } as unknown as Browser, context })),
      createSession: vi.fn(async () => ({ id: "session", connectUrl: "ws://example.com" })),
      getLiveView: vi.fn(async () => ({ id: "page", title: "New Tab", url: currentUrl, liveViewUrl: "https://example.com/live" })),
      releaseSession: vi.fn(async () => undefined),
    };
    const runtime = new RecordingRuntime(crypto.randomUUID(), provider, vi.fn());
    await runtime.start({ timeoutSeconds: 120, region: "us-west-2" });
    runtime.buffer.splice(0);

    handlers.get("framenavigated")?.({});
    handlers.get("framenavigated")?.(mainFrame);
    currentUrl = "https://example.com/one";
    handlers.get("framenavigated")?.(mainFrame);
    handlers.get("framenavigated")?.(mainFrame);
    currentUrl = "https://example.com/two";
    handlers.get("framenavigated")?.(mainFrame);

    const startUrls = runtime.buffer.flatMap((item) => item.message.type === "recording.startUrl" ? [item.message.url] : []);
    expect(startUrls).toEqual(["https://example.com/one"]);
    expect(runtime.buffer.some((item) => item.message.type === "recorded.action")).toBe(false);
  });

  it("turns a fresh replay session into a recorder after the workflow completes", async () => {
    let currentUrl = "about:blank";
    const handlers = new Map<string, (...args: unknown[]) => void>();
    let binding: ((source: { page: Page; frame: unknown }, raw: unknown) => Promise<void>) | undefined;
    const mainFrame = { url: vi.fn(() => currentUrl) };
    const page = {
      evaluate: vi.fn(async () => undefined),
      frames: vi.fn(() => [mainFrame]),
      goto: vi.fn(async (url: string) => { currentUrl = url; return null; }),
      mainFrame: vi.fn(() => mainFrame),
      on: vi.fn((name: string, handler: (...args: unknown[]) => void) => { handlers.set(name, handler); }),
      title: vi.fn(async () => "Replay"),
      url: vi.fn(() => currentUrl),
    } as unknown as Page;
    const context = {
      addInitScript: vi.fn(async () => undefined),
      exposeBinding: vi.fn(async (_name: string, callback: typeof binding) => { binding = callback; }),
      on: vi.fn(),
      pages: vi.fn(() => [page]),
    } as unknown as BrowserContext;
    const provider: BrowserProvider = {
      connect: vi.fn(async () => ({ browser: { close: vi.fn(async () => undefined) } as unknown as Browser, context })),
      createSession: vi.fn(async () => ({ id: "replay-session", connectUrl: "ws://example.com" })),
      getLiveView: vi.fn(async () => ({ id: "page", title: "Replay", url: currentUrl, liveViewUrl: "https://example.com/live" })),
      releaseSession: vi.fn(async () => undefined),
    };
    const workflow = createWorkflow("recorded-session");
    workflow.steps.push({
      id: "navigate",
      order: 0,
      name: "Open example",
      enabled: true,
      page: { id: "recorded-page", url: "https://example.com" },
      metadata: { recordedAt: new Date().toISOString(), origin: "recorded", sensitive: false },
      type: "navigate",
      payload: { url: "https://example.com" },
    });
    const runtime = new RecordingRuntime(crypto.randomUUID(), provider, vi.fn());
    await runtime.startReplay(workflow, undefined, { timeoutSeconds: 120, region: "us-west-2" });
    await vi.waitFor(() => expect(runtime.buffer.some((item) => item.message.type === "replay.status" && item.message.status === "completed")).toBe(true));
    runtime.buffer.splice(0);

    currentUrl = "https://example.com/after-replay";
    handlers.get("framenavigated")?.(mainFrame);
    expect(runtime.buffer.some((item) => item.message.type === "recorded.action")).toBe(false);
    expect(runtime.buffer.some((item) => item.message.type === "recording.startUrl")).toBe(false);

    await binding?.({ page, frame: mainFrame }, {
      type: "click",
      name: "Click Continue",
      target: { candidates: [{ kind: "role", value: "button", name: "Continue", exact: true }] },
      sensitive: false,
    });
    expect(runtime.buffer.some((item) => item.message.type === "recorded.action" && item.message.action.name === "Click Continue")).toBe(true);
    expect(runtime.buffer.at(-1)?.message).toEqual({ type: "recorded.action", action: expect.objectContaining({ name: "Click Continue" }) });
  });

  it("replays the growing workflow inside the active recorder session", async () => {
    let currentUrl = "https://example.com/start";
    let binding: ((source: { page: Page; frame: unknown }, raw: unknown) => Promise<void>) | undefined;
    const locator = {
      count: vi.fn(async () => 1),
      isVisible: vi.fn(async () => true),
      click: vi.fn(async () => {
        await binding?.({ page, frame: mainFrame }, {
          type: "click",
          name: "Replay-generated click",
          target: { candidates: [{ kind: "testId", value: "continue", exact: true }] },
          sensitive: false,
        });
      }),
    };
    const mainFrame = {
      getByTestId: vi.fn(() => locator),
      url: vi.fn(() => currentUrl),
    };
    const page = {
      evaluate: vi.fn(async () => undefined),
      frames: vi.fn(() => [mainFrame]),
      goto: vi.fn(async (url: string) => { currentUrl = url; return null; }),
      mainFrame: vi.fn(() => mainFrame),
      on: vi.fn(),
      title: vi.fn(async () => "Example"),
      url: vi.fn(() => currentUrl),
    } as unknown as Page;
    const context = {
      addInitScript: vi.fn(async () => undefined),
      exposeBinding: vi.fn(async (_name: string, callback: typeof binding) => { binding = callback; }),
      on: vi.fn(),
      pages: vi.fn(() => [page]),
    } as unknown as BrowserContext;
    const provider: BrowserProvider = {
      connect: vi.fn(async () => ({ browser: { close: vi.fn(async () => undefined) } as unknown as Browser, context })),
      createSession: vi.fn(async () => ({ id: "session", connectUrl: "ws://example.com" })),
      getLiveView: vi.fn(async () => ({ id: "page", title: "Example", url: currentUrl, liveViewUrl: "https://example.com/live" })),
      releaseSession: vi.fn(async () => undefined),
    };
    const workflow = createWorkflow("session");
    workflow.source.startUrl = "https://example.com/start";
    workflow.steps.push({
      id: "continue",
      order: 0,
      name: "Click Continue",
      enabled: true,
      page: { id: "recorded-page", url: "https://example.com/start" },
      target: { candidates: [{ kind: "testId", value: "continue", exact: true }] },
      metadata: { recordedAt: new Date().toISOString(), origin: "recorded", sensitive: false },
      type: "click",
    });
    const runtime = new RecordingRuntime(crypto.randomUUID(), provider, vi.fn());
    await runtime.start({ timeoutSeconds: 120, region: "us-west-2" });
    runtime.buffer.splice(0);

    await runtime.startReplay(workflow, undefined, { timeoutSeconds: 120, region: "us-west-2" });
    await vi.waitFor(() => expect(runtime.buffer.some((item) => item.message.type === "replay.status" && item.message.status === "completed")).toBe(true));

    expect(provider.createSession).toHaveBeenCalledOnce();
    expect(provider.releaseSession).not.toHaveBeenCalled();
    expect(runtime.buffer.some((item) => item.message.type === "recorded.action" && item.message.action.name === "Replay-generated click")).toBe(false);
    expect(runtime.buffer.at(-1)?.message).toEqual({ type: "session.status", status: "recording" });

    await binding?.({ page, frame: mainFrame }, {
      type: "click",
      name: "Click next step",
      target: { candidates: [{ kind: "testId", value: "next", exact: true }] },
      sensitive: false,
    });
    expect(runtime.buffer.at(-1)?.message).toEqual({ type: "recorded.action", action: expect.objectContaining({ name: "Click next step" }) });

    locator.click.mockRejectedValueOnce(new Error("Button unavailable"));
    await runtime.startReplay(workflow, undefined, { timeoutSeconds: 120, region: "us-west-2" });
    await vi.waitFor(() => expect(runtime.buffer.some((item) => item.message.type === "replay.step" && item.message.status === "failed")).toBe(true));
    await runtime.stopReplay();

    expect(provider.createSession).toHaveBeenCalledOnce();
    expect(provider.releaseSession).not.toHaveBeenCalled();
    expect(runtime.buffer.at(-1)?.message).toEqual({ type: "session.status", status: "recording" });
  });

  it("uses Browserbase fullscreen URLs without the native navbar", () => {
    const url = hideLiveViewNavbar("https://example.com/live?token=abc");
    expect(url).toContain("token=abc");
    expect(url).toContain("navbar=false");
    const liveView = selectLiveViewPage({
      debuggerFullscreenUrl: "https://example.com/session-fullscreen?token=session",
      pages: [{
        id: "page",
        title: "Example",
        url: "https://example.com/",
        debuggerFullscreenUrl: "https://example.com/page-fullscreen?token=page",
      }],
    }, 0);
    expect(liveView.liveViewUrl).toContain("page-fullscreen");
    expect(liveView.liveViewUrl).toContain("navbar=false");
  });

  it("accepts the custom browser command protocol", () => {
    expect(ClientMessageSchema.safeParse({ type: "browser.navigate", url: "example.com" }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "browser.back" }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "browser.forward" }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "browser.reload" }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "browser.navigate", url: "" }).success).toBe(false);
  });

  it("runs commands against the active page and emits recoverable page state", async () => {
    let currentUrl = "about:blank";
    const goto = vi.fn(async () => { currentUrl = "https://resolved.example.net/"; return null; });
    const goBack = vi.fn(async () => null);
    const goForward = vi.fn(async () => null);
    const reload = vi.fn(async () => null);
    const page = {
      evaluate: vi.fn(async () => undefined),
      goBack,
      goForward,
      goto,
      mainFrame: vi.fn(() => ({})),
      on: vi.fn(),
      reload,
      title: vi.fn(async () => currentUrl === "about:blank" ? "New Tab" : "Example"),
      url: vi.fn(() => currentUrl),
    } as unknown as Page;
    const context = {
      addInitScript: vi.fn(async () => undefined),
      exposeBinding: vi.fn(async () => undefined),
      on: vi.fn(),
      pages: vi.fn(() => [page]),
    } as unknown as BrowserContext;
    const provider: BrowserProvider = {
      connect: vi.fn(async () => ({ browser: { close: vi.fn(async () => undefined) } as unknown as Browser, context })),
      createSession: vi.fn(async () => ({ id: "session", connectUrl: "ws://example.com" })),
      getLiveView: vi.fn(async () => ({ id: "page", title: "New Tab", url: currentUrl, liveViewUrl: "https://example.com/live?navbar=false" })),
      releaseSession: vi.fn(async () => undefined),
    };
    const runtime = new RecordingRuntime(crypto.randomUUID(), provider, vi.fn());
    await runtime.start({ timeoutSeconds: 120, region: "us-west-2" });
    runtime.buffer.splice(0);

    await runtime.navigate("example.com");
    await runtime.goBack();
    await runtime.goForward();
    await runtime.reload();

    expect(goto).toHaveBeenCalledWith("https://example.com/", expect.objectContaining({ waitUntil: "domcontentloaded" }));
    expect(goBack).toHaveBeenCalledOnce();
    expect(goForward).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(runtime.buffer.some((item) => item.message.type === "recording.startUrl" && item.message.url === "https://example.com/")).toBe(true);
    expect(runtime.buffer.some((item) => item.message.type === "browser.page" && item.message.url === "https://resolved.example.net/")).toBe(true);

    runtime.buffer.splice(0);
    await runtime.navigate("file:///tmp/private");
    expect(runtime.buffer.at(-1)?.message).toEqual({ type: "browser.navigation.error", message: "Use an HTTP or HTTPS web address." });
  });
});
