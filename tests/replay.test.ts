import { describe, expect, it, vi } from "vitest";
import type { Frame, Locator, Page } from "playwright-core";
import type { ServerMessage } from "@/lib/protocol";
import { createWorkflow, type Workflow, type WorkflowStep } from "@/lib/workflow/schema";
import { preflightReplay, ReplayEngine } from "@/server/replay/engine";

const recordedAt = new Date().toISOString();
const target = { candidates: [{ kind: "testId" as const, value: "target", exact: true }] };

function baseStep(type: WorkflowStep["type"], order: number) {
  return {
    id: `step-${order}`,
    order,
    name: `${type} step`,
    enabled: true,
    page: { id: "page", url: "https://example.com" },
    target,
    metadata: { recordedAt, origin: "recorded" as const, sensitive: false },
  };
}

function workflowWith(steps: WorkflowStep[]): Workflow {
  const workflow = createWorkflow("recorded-session");
  workflow.steps = steps;
  return workflow;
}

function replayPage(click = vi.fn(async () => undefined)) {
  const locator = {
    check: vi.fn(async () => undefined),
    click,
    count: vi.fn(async () => 1),
    evaluate: vi.fn(async () => true),
    fill: vi.fn(async () => undefined),
    isVisible: vi.fn(async () => true),
    press: vi.fn(async () => undefined),
    selectOption: vi.fn(async () => ["value"]),
    uncheck: vi.fn(async () => undefined),
  } as unknown as Locator;
  const frame = { getByTestId: vi.fn(() => locator) } as unknown as Frame;
  const page = {
    frames: vi.fn(() => [frame]),
    goto: vi.fn(async () => null),
    mainFrame: vi.fn(() => frame),
  } as unknown as Page;
  return { page, locator };
}

describe("replay preflight", () => {
  it("uses recorded page context when an explicit start URL is absent", () => {
    const click = { ...baseStep("click", 0), type: "click" as const };
    expect(preflightReplay(workflowWith([click])).bootstrapUrl).toBe("https://example.com");
    const withStart = workflowWith([click]);
    withStart.source.startUrl = "https://start.example.com";
    expect(preflightReplay(withStart).bootstrapUrl).toBe("https://start.example.com");
    const withoutHttpContext = { ...click, page: { ...click.page, url: "about:blank" } };
    expect(() => preflightReplay(workflowWith([withoutHttpContext]))).toThrow(/recorded HTTP page URL/i);
  });

  it("rejects missing selected steps and duplicate IDs", () => {
    const navigate = { ...baseStep("navigate", 0), type: "navigate" as const, payload: { url: "https://example.com" } };
    expect(() => preflightReplay(workflowWith([navigate]), "missing")).toThrow(/no longer/i);
    expect(() => preflightReplay(workflowWith([navigate, { ...navigate, order: 1 }]))).toThrow(/unique/i);
  });
});

describe("replay engine", () => {
  it("executes every supported action and reports completion", async () => {
    const steps: WorkflowStep[] = [
      { ...baseStep("navigate", 0), type: "navigate", payload: { url: "https://example.com" } },
      { ...baseStep("click", 1), type: "click" },
      { ...baseStep("fill", 2), type: "fill", payload: { value: "hello" } },
      { ...baseStep("set_date", 3), type: "set_date", payload: { value: "2026-07-21" } },
      { ...baseStep("select", 4), type: "select", payload: { value: "one" } },
      { ...baseStep("check", 5), type: "check" },
      { ...baseStep("uncheck", 6), type: "uncheck" },
      { ...baseStep("keypress", 7), type: "keypress", payload: { key: "Enter", modifiers: ["Control"] } },
      { ...baseStep("submit", 8), type: "submit" },
    ];
    const messages: ServerMessage[] = [];
    const { page, locator } = replayPage();
    const engine = new ReplayEngine(crypto.randomUUID(), page, preflightReplay(workflowWith(steps)), (message) => messages.push(message));
    await engine.run();
    expect(page.goto).toHaveBeenCalledOnce();
    expect(locator.click).toHaveBeenCalledOnce();
    expect(locator.fill).toHaveBeenCalledTimes(2);
    expect(locator.selectOption).toHaveBeenCalledOnce();
    expect(locator.check).toHaveBeenCalledOnce();
    expect(locator.uncheck).toHaveBeenCalledOnce();
    expect(locator.press).toHaveBeenCalledWith("Control+Enter", expect.anything());
    expect(locator.evaluate).toHaveBeenCalledOnce();
    expect(messages.at(-1)).toMatchObject({ type: "replay.status", status: "completed" });
  });

  it("pauses on failure and continues after the user skips the step", async () => {
    const failure = new Error("Button is disabled");
    const click = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const steps: WorkflowStep[] = [
      { ...baseStep("navigate", 0), type: "navigate", payload: { url: "https://example.com" } },
      { ...baseStep("click", 1), type: "click" },
    ];
    const messages: ServerMessage[] = [];
    const { page } = replayPage(click);
    const engine = new ReplayEngine(crypto.randomUUID(), page, preflightReplay(workflowWith(steps)), (message) => messages.push(message));
    const running = engine.run();
    await vi.waitFor(() => expect(messages.some((message) => message.type === "replay.step" && message.status === "failed")).toBe(true));
    engine.skip();
    await running;
    expect(messages).toContainEqual(expect.objectContaining({ type: "replay.step", stepId: "step-1", status: "skipped" }));
    expect(messages.at(-1)).toMatchObject({ type: "replay.status", status: "completed" });
  });
});
