import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepEditor } from "@/components/StepEditor";
import { Toolbar } from "@/components/Toolbar";
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
    const { rerender } = render(<StepEditor step={step} onUpdate={(updated) => { step = updated; rerender(<StepEditor step={step} onUpdate={() => undefined} />); }} />);
    await user.clear(screen.getByLabelText("Step name"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/give this step a name/i);
  });
});
