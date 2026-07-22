import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BrowserPanel } from "@/features/browser/BrowserPanel";
import { RecorderControls } from "@/features/recorder/RecorderControls";
import { ReplayControls } from "@/features/replay/ReplayControls";
import { WorkspaceNavbar } from "@/features/recorder/WorkspaceNavbar";
import { ManualStepDialog } from "@/features/workflow/ManualStepDialog";
import { StepEditor } from "@/features/workflow/StepEditor";
import { WorkflowTimeline } from "@/features/workflow/WorkflowTimeline";
import { stepFromRecordedAction } from "@/lib/workflow/recorded-action";

describe("WorkflowTimeline", () => {
  it("shows a target-focused title while retaining action and replay metadata", () => {
    const step = stepFromRecordedAction({
      type: "click",
      name: "Continue",
      sensitive: false,
      target: {
        candidates: [
          { kind: "role", value: "button", name: "Continue", exact: true },
        ],
      },
      page: { id: "page", url: "https://example.com" },
      recordedAt: new Date().toISOString(),
    }, 0);

    render(
      <WorkflowTimeline
        steps={[step]}
        selectedId={step.id}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
        onInsert={vi.fn()}
        onCollapse={vi.fn()}
        replayResults={{ [step.id]: { status: "passed" } }}
      />,
    );

    expect(screen.getByText("Continue", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("1 · click · passed", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Replay passed", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /duplicate/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disable continue/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete continue/i })).toBeInTheDocument();
  });
});

describe("ManualStepDialog", () => {
  it("uses and restores a target-focused default across action types", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const rendered = render(
      <ManualStepDialog
        open
        order={0}
        page={{ id: "page", url: "https://example.com" }}
        onClose={onClose}
        onInsert={vi.fn()}
      />,
    );

    const name = screen.getByLabelText("Step name");
    expect(name).toHaveValue("Element");
    await user.selectOptions(screen.getByLabelText("Action type"), "fill");
    expect(name).toHaveValue("Element");
    await user.clear(name);
    await user.type(name, "Email address");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(screen.getByLabelText("Step name")).toHaveValue("Element");
    expect(screen.getByLabelText("Action type")).toHaveValue("click");
    rendered.unmount();
  });
});

describe("WorkspaceNavbar", () => {
  it("moves workflow identity and export into the expanded sidebar navbar", async () => {
    const user = userEvent.setup();
    const onNameChange = vi.fn();
    const onExport = vi.fn();
    const { rerender } = render(<WorkspaceNavbar collapsed={false} workflowName="Checkout" status="idle" transportStatus="connected" elapsed="00:00" stepCount={0} onNameChange={onNameChange} onExpand={vi.fn()} onStart={vi.fn()} onStop={vi.fn()} onExport={onExport} />);

    expect(screen.getByText("Memory Recorder")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /workflow name/i }), " flow");
    expect(onNameChange).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /export/i })).toBeDisabled();

    rerender(<WorkspaceNavbar collapsed={false} workflowName="Checkout" status="idle" transportStatus="connected" elapsed="00:00" stepCount={1} onNameChange={onNameChange} onExpand={vi.fn()} onStart={vi.fn()} onStop={vi.fn()} onExport={onExport} />);
    await user.click(screen.getByRole("button", { name: /export/i }));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it("keeps core controls available in the collapsed rail", async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    const onStart = vi.fn();
    const onExport = vi.fn();
    const { container } = render(<WorkspaceNavbar collapsed workflowName="Checkout" status="idle" transportStatus="connected" elapsed="00:00" stepCount={1} onNameChange={vi.fn()} onExpand={onExpand} onStart={onStart} onStop={vi.fn()} onExport={onExport} />);
    const rail = within(container);

    await user.click(rail.getByRole("button", { name: /expand workflow timeline/i }));
    await user.click(rail.getByRole("button", { name: /start recording/i }));
    await user.click(rail.getByRole("button", { name: /export workflow/i }));

    expect(onExpand).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onExport).toHaveBeenCalledOnce();
  });
});

describe("RecorderControls", () => {
  it("switches from a ready start action to an active timer and stop action", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const onStop = vi.fn();
    const { container, rerender } = render(<RecorderControls status="idle" transportStatus="connected" elapsed="00:00" onStart={onStart} onStop={onStop} announce />);
    const controls = within(container);

    expect(controls.getByText("Ready")).toBeInTheDocument();
    expect(controls.queryByText("Cloud Browser")).not.toBeInTheDocument();
    await user.click(controls.getByRole("button", { name: /start recording/i }));
    expect(onStart).toHaveBeenCalledOnce();

    rerender(<RecorderControls status="recording" transportStatus="connected" elapsed="01:24" onStart={onStart} onStop={onStop} announce />);
    expect(controls.getByText("Recording")).toBeInTheDocument();
    expect(controls.getByText("01:24")).toBeInTheDocument();
    await user.click(controls.getByRole("button", { name: /stop recording/i }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("labels and disables unavailable or busy recorder states", () => {
    const { container, rerender } = render(<RecorderControls status="idle" transportStatus="offline" elapsed="00:00" onStart={vi.fn()} onStop={vi.fn()} />);
    const controls = within(container);
    expect(controls.getByText("Offline")).toBeInTheDocument();
    expect(controls.getByRole("button", { name: /start recording/i })).toBeDisabled();

    rerender(<RecorderControls status="starting" transportStatus="connected" elapsed="00:01" onStart={vi.fn()} onStop={vi.fn()} />);
    expect(controls.getByText("Starting")).toBeInTheDocument();
    expect(controls.getByRole("button", { name: /stop recording/i })).toBeDisabled();
  });
});

describe("ReplayControls", () => {
  it("shows normal pause/resume controls separately from failure recovery", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    const handlers = { onPause: vi.fn(), onResume, onRetry: vi.fn(), onSkip: vi.fn(), onTakeControl: vi.fn(), onStop: vi.fn() };
    const { rerender } = render(<ReplayControls status="paused" currentIndex={1} totalSteps={3} {...handlers} />);
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();

    rerender(<ReplayControls status="paused" currentIndex={1} totalSteps={3} failed {...handlers} />);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take control" })).toBeInTheDocument();
  });
});

describe("StepEditor", () => {
  it("shows inline validation when a required name is removed", async () => {
    const user = userEvent.setup();
    let step = stepFromRecordedAction({
      type: "click", name: "Click Continue", sensitive: false,
      target: { candidates: [{ kind: "role", value: "button", name: "Continue", exact: true }] },
      page: { id: "page", url: "https://example.com" }, recordedAt: new Date().toISOString(),
    }, 0);
    const { rerender } = render(<StepEditor step={step} onCollapse={() => undefined} onUpdate={(updated) => { step = updated; rerender(<StepEditor step={step} onCollapse={() => undefined} onUpdate={() => undefined} />); }} />);
    await user.clear(screen.getByLabelText("Step name"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/give this step a name/i);
  });

  it("edits a post-action delay and element wait condition", async () => {
    const user = userEvent.setup();
    let step = stepFromRecordedAction({
      type: "click", name: "Open quotes", sensitive: false,
      target: { candidates: [{ kind: "testId", value: "open-quotes", exact: true }] },
      page: { id: "page", url: "https://example.com" }, recordedAt: new Date().toISOString(),
    }, 0);
    const onUpdate = vi.fn((updated: typeof step) => {
      step = updated;
    });
    const rendered = render(<StepEditor step={step} onUpdate={onUpdate} />);
    onUpdate.mockImplementation((updated) => {
      step = updated;
      rendered.rerender(<StepEditor step={step} onUpdate={onUpdate} />);
    });
    const waitEditor = within(rendered.container.querySelector(".replay-wait-editor") as HTMLElement);

    await user.clear(waitEditor.getByLabelText(/additional delay/i));
    await user.type(waitEditor.getByLabelText(/additional delay/i), "1200");
    await user.selectOptions(waitEditor.getByLabelText(/element condition/i), "hidden");
    await user.type(waitEditor.getByLabelText("Value"), ".loading");
    await user.type(waitEditor.getByLabelText(/frame URL/i), "https://example.com/frame");

    expect(step.waitAfter).toMatchObject({
      delayMs: 1_200,
      condition: {
        state: "hidden",
        target: {
          frameUrl: "https://example.com/frame",
          candidates: [{ kind: "css", value: ".loading" }],
        },
      },
    });
  });

  it("edits and removes the position attached to an action", async () => {
    const user = userEvent.setup();
    let step = stepFromRecordedAction({
      type: "click", name: "Continue", sensitive: false,
      target: { candidates: [{ kind: "testId", value: "continue", exact: true }] },
      position: { x: 10, y: 80, frameUrl: "https://widgets.example.com/frame" },
      page: { id: "page", url: "https://example.com" }, recordedAt: new Date().toISOString(),
    }, 0);
    const onUpdate = vi.fn((updated: typeof step) => { step = updated; });
    const rendered = render(<StepEditor step={step} onUpdate={onUpdate} />);
    onUpdate.mockImplementation((updated) => {
      step = updated;
      rendered.rerender(<StepEditor step={step} onUpdate={onUpdate} />);
    });
    const positionEditor = within(rendered.container.querySelector(".position-before-editor") as HTMLElement);

    await user.clear(positionEditor.getByLabelText(/vertical position/i));
    await user.type(positionEditor.getByLabelText(/vertical position/i), "720");
    expect(step.position).toEqual({ x: 10, y: 720, frameUrl: "https://widgets.example.com/frame" });

    await user.click(positionEditor.getByRole("button", { name: /remove action position/i }));
    expect(step.position).toBeUndefined();
    expect(rendered.container.querySelector(".position-before-editor")).not.toBeInTheDocument();
  });
});

describe("BrowserPanel", () => {
  it("frames the embedded browser with cloud-session chrome and preserves session overlays", () => {
    const { container } = render(
      <BrowserPanel
        status="reconnecting"
        transportStatus="reconnecting"
        elapsed="00:42"
        liveViewUrl="https://example.com/live-view"
        page={{ pageId: "page", title: "Example Domain", url: "https://example.com/" }}
        error="The browser connection was interrupted."
        navigationError={null}
        navigationPending={false}
        popup={{ pageId: "popup", title: "Account", url: "https://example.com/account" }}
        onBack={vi.fn()}
        onForward={vi.fn()}
        onNavigate={vi.fn()}
        onReload={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onRetry={vi.fn()}
        onSwitchPopup={vi.fn()}
      />,
    );
    const panel = within(container);

    expect(panel.getByRole("heading", { name: /interactive cloud browser/i })).toBeInTheDocument();
    expect(panel.getByTitle(/interactive browserbase browser/i)).toHaveAttribute("src", "https://example.com/live-view");
    expect(panel.getByRole("textbox", { name: /web address/i })).toHaveValue("https://example.com/");
    expect(panel.getByText("Example Domain")).toBeInTheDocument();
    expect(panel.queryByText("Cloud Browser")).not.toBeInTheDocument();
    expect(panel.getByText("Reconnecting", { exact: true })).toBeInTheDocument();
    expect(panel.getByText("00:42")).toBeInTheDocument();
    expect(panel.getByText(/preparing secure browser/i)).toBeInTheDocument();
    expect(panel.getByText(/reconnecting recorder transport/i)).toBeInTheDocument();
    expect(panel.getByRole("alert")).toHaveTextContent(/browser connection was interrupted/i);
    expect(panel.getByText(/new tab opened/i)).toBeInTheDocument();
  });

  it("routes browser navigation through accessible custom controls", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onForward = vi.fn();
    const onNavigate = vi.fn();
    const onReload = vi.fn();
    const { container } = render(
      <BrowserPanel
        status="recording"
        transportStatus="connected"
        elapsed="00:12"
        liveViewUrl="https://example.com/live-view?navbar=false"
        page={{ pageId: "page", title: "Example Domain", url: "https://example.com/" }}
        error={null}
        navigationError={null}
        navigationPending={false}
        popup={null}
        onBack={onBack}
        onForward={onForward}
        onNavigate={onNavigate}
        onReload={onReload}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onRetry={vi.fn()}
        onSwitchPopup={vi.fn()}
      />,
    );
    const panel = within(container);

    await user.click(panel.getByRole("button", { name: /go back/i }));
    await user.click(panel.getByRole("button", { name: /go forward/i }));
    await user.click(panel.getByRole("button", { name: /reload page/i }));
    const address = panel.getByRole("textbox", { name: /web address/i });
    await user.clear(address);
    await user.type(address, "example.org{Enter}");

    expect(onBack).toHaveBeenCalledOnce();
    expect(onForward).toHaveBeenCalledOnce();
    expect(onReload).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith("example.org");
  });

  it("returns to recorder controls when an incremental replay completes", () => {
    const { container } = render(
      <BrowserPanel
        status="recording"
        transportStatus="connected"
        elapsed="00:12"
        liveViewUrl="https://example.com/live-view"
        page={{ pageId: "page", title: "Example", url: "https://example.com/" }}
        error={null}
        navigationError={null}
        navigationPending={false}
        popup={null}
        replayStatus="completed"
        replayCurrentIndex={1}
        replayTotalSteps={2}
        onBack={vi.fn()}
        onForward={vi.fn()}
        onNavigate={vi.fn()}
        onReload={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onRetry={vi.fn()}
        onSwitchPopup={vi.fn()}
      />,
    );
    const panel = within(container);

    expect(panel.getByText("Recording")).toBeInTheDocument();
    expect(panel.getByRole("button", { name: /stop recording/i })).toBeInTheDocument();
    expect(panel.queryByRole("button", { name: /stop replay/i })).not.toBeInTheDocument();
  });

  it("selects and dismisses dates from the custom calendar", async () => {
    vi.stubGlobal("ResizeObserver", class ResizeObserver {
      observe() {}
      disconnect() {}
    });
    const user = userEvent.setup();
    const onDateSelect = vi.fn();
    const onDateDismiss = vi.fn();
    const { container } = render(
      <BrowserPanel
        status="recording"
        transportStatus="connected"
        elapsed="00:12"
        liveViewUrl="https://example.com/live-view"
        page={{ pageId: "page", title: "Booking", url: "https://example.com/booking" }}
        error={null}
        navigationError={null}
        navigationPending={false}
        popup={null}
        datePicker={{
          requestId: "c7daf0b9-d92a-44db-9967-db33d1516976",
          value: "2026-07-21",
          min: "2026-07-01",
          max: "2026-08-31",
          rect: { x: 100, y: 120, width: 160, height: 32 },
          viewport: { width: 1280, height: 720 },
        }}
        onBack={vi.fn()}
        onForward={vi.fn()}
        onNavigate={vi.fn()}
        onReload={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onRetry={vi.fn()}
        onSwitchPopup={vi.fn()}
        onDateSelect={onDateSelect}
        onDateDismiss={onDateDismiss}
      />,
    );
    const panel = within(container);

    expect(panel.getByRole("dialog", { name: "Choose date" })).toBeInTheDocument();
    await user.click(panel.getByRole("button", { name: "July 22, 2026" }));
    expect(onDateSelect).toHaveBeenCalledWith("c7daf0b9-d92a-44db-9967-db33d1516976", "2026-07-22");

    await user.keyboard("{Escape}");
    expect(onDateDismiss).toHaveBeenCalledWith("c7daf0b9-d92a-44db-9967-db33d1516976");
  });
});
