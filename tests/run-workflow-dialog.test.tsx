import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunWorkflowDialog } from "@/features/replay/RunWorkflowDialog";

afterEach(cleanup);

describe("RunWorkflowDialog", () => {
  it("confirms that replay replaces the current cloud browser", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    render(<RunWorkflowDialog open sensitive={false} onClose={vi.fn()} onRun={onRun} />);

    expect(screen.getByText(/close the current cloud browser and run this workflow in a fresh browserbase session/i)).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Run workflow" }));
    expect(onRun).toHaveBeenCalledOnce();
  });

  it("cancels without running", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onRun = vi.fn();
    render(<RunWorkflowDialog open sensitive={false} onClose={onClose} onRun={onRun} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onRun).not.toHaveBeenCalled();
  });

  it("describes run-from-here and combines it with the sensitive-value warning", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onRun = vi.fn();
    render(<RunWorkflowDialog open sensitive startStepName="Submit order" onClose={onClose} onRun={onRun} />);

    expect(screen.getByRole("heading", { name: /run workflow from this step/i })).toBeVisible();
    expect(screen.getByText(/fresh browserbase session at “submit order,/i)).toBeVisible();
    expect(screen.getByText(/contains sensitive values/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: /run sensitive workflow/i }));
    expect(onRun).toHaveBeenCalledOnce();
  });
});
