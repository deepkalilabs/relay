import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BrowserPanel } from "@/features/browser/BrowserPanel";
import { Toolbar } from "@/features/recorder/Toolbar";
import { StepEditor } from "@/features/workflow/StepEditor";
import { stepFromRecordedAction } from "@/lib/workflow/recorded-action";

describe("Toolbar", () => {
  it("exposes a named workflow field and start action", async () => {
    const user = userEvent.setup();
    const onNameChange = vi.fn();
    const onStart = vi.fn();
    render(<Toolbar workflowName="Checkout" status="idle" transportStatus="connected" elapsed="00:00" stepCount={0} onNameChange={onNameChange} onStart={onStart} onStop={vi.fn()} onExport={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /new recording/i }));
    expect(onStart).toHaveBeenCalledOnce();
    await user.type(screen.getByRole("textbox", { name: /workflow name/i }), " flow");
    expect(onNameChange).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /export/i })).toBeDisabled();
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
});

describe("BrowserPanel", () => {
  it("frames the embedded browser with cloud-session chrome and preserves session overlays", () => {
    const { container } = render(
      <BrowserPanel
        status="reconnecting"
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
        onRetry={vi.fn()}
        onSwitchPopup={vi.fn()}
      />,
    );
    const panel = within(container);

    expect(panel.getByRole("heading", { name: /interactive cloud browser/i })).toBeInTheDocument();
    expect(panel.getByTitle(/interactive browserbase browser/i)).toHaveAttribute("src", "https://example.com/live-view");
    expect(panel.getByRole("textbox", { name: /web address/i })).toHaveValue("https://example.com/");
    expect(panel.getByText("Example Domain")).toBeInTheDocument();
    expect(panel.getByText("Cloud Browser")).toBeInTheDocument();
    expect(panel.getByText("Reconnecting", { exact: true })).toBeInTheDocument();
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
});
