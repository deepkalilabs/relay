import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationsScreen } from "@/features/automations";
import type { WorkflowLibraryResponse } from "@/shared/contracts/workflow/library";

const DRAFT_ID = "36df661c-f159-47ac-bdf5-2afc0680cc4d";
const COMPLETE_ID = "1d942a81-b2e4-4dc9-916d-8a761db5f75f";

const libraryData: WorkflowLibraryResponse = {
  workflows: [
    {
      id: DRAFT_ID,
      name: "Checkout flow",
      status: "draft",
      updatedAt: "2026-07-27T20:00:00.000Z",
      steps: [{ id: "checkout-1", name: "Open checkout", order: 0 }],
    },
    {
      id: COMPLETE_ID,
      name: "Create support ticket",
      status: "complete",
      updatedAt: "2026-07-26T20:00:00.000Z",
      steps: [
        { id: "support-1", name: "Open portal", order: 0 },
        { id: "support-2", name: "Submit ticket", order: 1 },
      ],
    },
  ],
  invalidFileCount: 0,
};

function libraryClient(data = libraryData) {
  return { list: vi.fn(async () => data) };
}

beforeEach(() => {
  vi.setSystemTime(new Date("2026-07-27T21:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function moveWorkflowToVerification(name: string, id: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Select Verification folder" }));
  await user.click(screen.getByRole("button", { name: "Add task" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Inbox task" }), id);
  await user.click(screen.getByRole("button", { name: "Add task to Verification" }));
  expect(screen.getByRole("region", { name: "Verification tasks" })).toHaveTextContent(name);
}

describe("AutomationsScreen", () => {
  it("hydrates Inbox and All workflows from Library without fictional activity", async () => {
    render(<AutomationsScreen client={libraryClient()} />);

    const allWorkflows = await screen.findByRole("region", { name: "All workflows workflows" });
    expect(within(allWorkflows).getByRole("row", { name: /Checkout flow/ })).toHaveTextContent("Draft");
    expect(within(allWorkflows).getByRole("row", { name: /Create support ticket/ })).toHaveTextContent("2 steps");
    expect(within(allWorkflows).getByRole("button", { name: "Run folder" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Select Inbox folder" }));
    expect(screen.getByRole("region", { name: "Inbox tasks" }).querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Run activity" })).toHaveTextContent("No active runs");
    expect(screen.queryByText("Salesforce connection timed out")).not.toBeInTheDocument();
  });

  it("keeps folder creation and real workflow movement in the current session", async () => {
    const user = userEvent.setup();
    render(<AutomationsScreen client={libraryClient()} />);
    await screen.findByText("Create support ticket");

    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.type(screen.getByRole("textbox", { name: "Folder name" }), "Renewals");
    await user.click(screen.getByRole("button", { name: "Create folder" }));
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Inbox task" }), COMPLETE_ID);
    await user.click(screen.getByRole("button", { name: "Add task to Renewals" }));

    const renewals = screen.getByRole("region", { name: "Renewals tasks" });
    expect(renewals).toHaveTextContent("Create support ticket");
    expect(within(renewals).getByRole("button", { name: "Run folder" })).toBeEnabled();
  });

  it("submits only completed workflows and renders real polling progress", async () => {
    const batchId = "dc375e45-9624-4b7b-b9d0-32eae90d7868";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ batchId, runCount: 1 }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        batchId,
        runs: [{ workflowId: COMPLETE_ID, status: "running", currentStep: 1, totalSteps: 2 }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        batchId,
        runs: [{ workflowId: COMPLETE_ID, status: "completed", currentStep: 2, totalSteps: 2 }],
      }), { status: 200 }));
    render(<AutomationsScreen client={libraryClient()} />);
    await screen.findByText("Create support ticket");
    await moveWorkflowToVerification("Create support ticket", COMPLETE_ID);
    await moveWorkflowToVerification("Checkout flow", DRAFT_ID);

    fireEvent.click(screen.getByRole("button", { name: "Run folder" }));

    expect(await screen.findByText("Running · Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Running folder…" })).toBeDisabled();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ workflowIds: [COMPLETE_ID] });

    expect(await screen.findByText("Completed · 2 steps", {}, { timeout: 2_000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Verification run completed."));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const nextBatchId = "44ee43bc-022a-4c1b-a788-94d303a15eed";
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ batchId: nextBatchId, runCount: 1 }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        batchId: nextBatchId,
        runs: [{ workflowId: COMPLETE_ID, status: "completed", currentStep: 2, totalSteps: 2 }],
      }), { status: 200 }));
    fireEvent.click(screen.getByRole("button", { name: "Run folder" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  });

  it("shows safe Relay failure details without mock copy", async () => {
    const batchId = "dc375e45-9624-4b7b-b9d0-32eae90d7868";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ batchId, runCount: 1 }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        batchId,
        runs: [{
          workflowId: COMPLETE_ID,
          status: "failed",
          currentStep: 0,
          totalSteps: 0,
          error: "The page did not load.",
        }],
      }), { status: 200 }));
    const user = userEvent.setup();
    render(<AutomationsScreen client={libraryClient()} />);
    await screen.findByText("Create support ticket");
    await moveWorkflowToVerification("Create support ticket", COMPLETE_ID);

    await user.click(screen.getByRole("button", { name: "Run folder" }));
    await user.click(await screen.findByRole("button", { name: "View details for Create support ticket" }));

    const dialog = screen.getByRole("dialog", { name: "Create support ticket run details" });
    expect(dialog).toHaveTextContent("Failed");
    expect(dialog).not.toHaveTextContent("step 0");
    expect(dialog).toHaveTextContent("The page did not load.");
    expect(dialog).not.toHaveTextContent("Mock run");
  });
});
