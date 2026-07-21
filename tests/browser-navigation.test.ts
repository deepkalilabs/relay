import { describe, expect, it, vi } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { ClientMessageSchema } from "@/lib/protocol";
import { hideLiveViewNavbar, selectLiveViewPage } from "@/server/provider/browserbase";
import type { BrowserProvider } from "@/server/provider/types";
import { normalizeBrowserUrl, RecordingRuntime } from "@/server/recorder/runtime";

describe("browser navigation", () => {
  it("normalizes scheme-less addresses and rejects unsafe protocols", () => {
    expect(normalizeBrowserUrl("example.com/path")).toBe("https://example.com/path");
    expect(normalizeBrowserUrl("http://example.com")).toBe("http://example.com/");
    expect(normalizeBrowserUrl("localhost:3000/path")).toBe("https://localhost:3000/path");
    expect(() => normalizeBrowserUrl("javascript:alert(1)")).toThrow(/http or https/i);
    expect(() => normalizeBrowserUrl("   ")).toThrow(/web address/i);
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
    const goto = vi.fn(async (url: string) => { currentUrl = url; return null; });
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
    expect(runtime.buffer.some((item) => item.message.type === "browser.page" && item.message.url === "https://example.com/")).toBe(true);

    runtime.buffer.splice(0);
    await runtime.navigate("file:///tmp/private");
    expect(runtime.buffer.at(-1)?.message).toEqual({ type: "browser.navigation.error", message: "Use an HTTP or HTTPS web address." });
  });
});
