import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationsScreen } from "@/features/automations";
import type { WorkflowLibraryResponse } from "@/shared/contracts/workflow/library";

const libraryData: WorkflowLibraryResponse = {
  workflows: [
    {
      id: "checkout-flow",
      name: "Checkout flow",
      status: "draft",
      updatedAt: "2026-07-27T20:00:00.000Z",
      steps: [
        { id: "checkout-1", name: "Open checkout", order: 0 },
        { id: "checkout-2", name: "Enter contact information", order: 1 },
      ],
    },
    {
      id: "support-ticket",
      name: "Create support ticket",
      status: "complete",
      updatedAt: "2026-07-26T20:00:00.000Z",
      steps: [{ id: "support-1", name: "Open the support portal", order: 0 }],
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

describe("AutomationsScreen", () => {
  it("selects All workflows and presents the persisted Library list as read-only", async () => {
    const client = libraryClient();
    render(<AutomationsScreen client={client} />);

    expect(screen.getByRole("heading", { name: "Automations", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/All workflows syncs with Library/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Automations" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Select All workflows folder" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const tasks = await screen.findByRole("region", { name: "All workflows workflows" });
    expect(screen.getByRole("button", { name: "Select All workflows folder" }).parentElement)
      .toHaveTextContent("2");
    expect(within(tasks).getAllByRole("row")).toHaveLength(3);
    const checkoutRow = within(tasks).getByRole("row", { name: /Checkout flow/ });
    expect(checkoutRow).toHaveTextContent("2 steps");
    expect(checkoutRow).toHaveTextContent("Updated 1h ago");
    expect(within(checkoutRow).queryByRole("button")).not.toBeInTheDocument();
    expect(within(checkoutRow).queryByRole("link")).not.toBeInTheDocument();
    expect(within(tasks).getByRole("row", { name: /Create support ticket/ })).toBeInTheDocument();
    expect(within(tasks).queryAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Run folder" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled();
    expect(client.list).toHaveBeenCalledOnce();

    const activity = screen.getByRole("region", { name: "Run activity" });
    expect(within(activity).getByText("Running · Step 3 of 8")).toBeInTheDocument();
    expect(within(activity).getByText("Salesforce connection timed out")).toBeInTheDocument();
  });

  it("shows a non-blocking loading state while Library workflows are requested", () => {
    render(<AutomationsScreen client={{ list: () => new Promise(() => undefined) }} />);

    const tasks = screen.getByRole("region", { name: "All workflows workflows" });
    expect(within(tasks).getByRole("status")).toHaveTextContent("Loading workflows");
    expect(within(tasks).getByRole("button", { name: "Run folder" })).toBeDisabled();
    expect(within(tasks).getByRole("button", { name: "Add task" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select Verification folder" })).toBeEnabled();
  });

  it("selects folders, aggregates nested tasks, and toggles branches", async () => {
    const user = userEvent.setup();
    render(<AutomationsScreen client={libraryClient()} />);

    await user.click(screen.getByRole("button", { name: "Select Customers folder" }));
    const tasks = screen.getByRole("region", { name: "Customers tasks" });
    expect(within(tasks).getAllByRole("row")).toHaveLength(13);
    expect(within(tasks).getByText(/Includes nested folders/)).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Collapse Customers folder" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(screen.queryByRole("button", { name: "Select Verification folder" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Customers folder" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("creates a nested folder and selects it immediately", async () => {
    const user = userEvent.setup();
    render(<AutomationsScreen client={libraryClient()} />);

    await user.click(screen.getByRole("button", { name: "Select Verification folder" }));

    await user.click(screen.getByRole("button", { name: "New folder" }));
    expect(screen.getByRole("dialog", { name: "Create folder" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "All workflows" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Parent folder" })).toHaveValue("verification");
    await user.type(screen.getByRole("textbox", { name: "Folder name" }), " leads ");
    await user.selectOptions(screen.getByRole("combobox", { name: "Parent folder" }), "customers");
    await user.click(screen.getByRole("button", { name: "Create folder" }));
    expect(screen.getByText("A folder with this name already exists here.")).toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "Folder name" }));
    await user.type(screen.getByRole("textbox", { name: "Folder name" }), " Renewals ");
    await user.click(screen.getByRole("button", { name: "Create folder" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Renewals folder" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("region", { name: "Renewals tasks" })).toHaveTextContent("No tasks in this folder");
    expect(screen.getByText("Renewals folder created.")).toBeInTheDocument();
  });

  it("moves a selected Inbox task into a folder and returns it to Inbox", async () => {
    const user = userEvent.setup();
    render(<AutomationsScreen client={libraryClient()} />);

    await user.click(screen.getByRole("button", { name: "Select Verification folder" }));

    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Inbox task" }),
      "export-monthly-report",
    );
    await user.click(screen.getByRole("button", { name: "Add task to Verification" }));

    let tasks = screen.getByRole("region", { name: "Verification tasks" });
    expect(within(tasks).getByRole("row", { name: /Export monthly report/ })).toBeInTheDocument();
    await user.click(within(tasks).getByRole("button", {
      name: "Remove Export monthly report from folder",
    }));
    expect(within(tasks).queryByRole("row", { name: /Export monthly report/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select Inbox folder" }));
    tasks = screen.getByRole("region", { name: "Inbox tasks" });
    expect(within(tasks).getByRole("row", { name: /Export monthly report/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled();
  });

  it("simulates folder tasks and retains the five most recent completions", async () => {
    vi.useFakeTimers();
    render(<AutomationsScreen client={libraryClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Verification folder" }));

    fireEvent.click(screen.getByRole("button", { name: "Run folder" }));
    expect(screen.getByRole("button", { name: "Running folder…" })).toBeDisabled();
    expect(screen.getAllByText("Queued").length).toBeGreaterThan(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByRole("button", { name: "Run folder" })).toBeEnabled();
    const completed = screen.getByRole("region", { name: "Completed runs" });
    expect(within(completed).getAllByRole("article")).toHaveLength(5);
    expect(screen.getByText("Verification run completed: 8 tasks.")).toBeInTheDocument();
  });

  it("opens failure details without retrying or executing the workflow", async () => {
    const user = userEvent.setup();
    render(<AutomationsScreen client={libraryClient()} />);

    await user.click(screen.getByRole("button", { name: "View details for Update CRM" }));
    const dialog = screen.getByRole("dialog", { name: "Update CRM run details" });
    expect(dialog).toHaveTextContent("Failed at step 4");
    expect(dialog).toHaveTextContent("Salesforce connection timed out");
    expect(dialog).toHaveTextContent("Mock run—no workflow was executed");

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("restores fixture data when the client workspace remounts", async () => {
    const user = userEvent.setup();
    const firstRender = render(<AutomationsScreen client={libraryClient()} />);

    await user.click(screen.getByRole("button", { name: "Select Verification folder" }));

    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.click(screen.getByRole("button", { name: "Add task to Verification" }));
    expect(screen.getByRole("region", { name: "Verification tasks" }))
      .toHaveTextContent("Export monthly report");

    firstRender.unmount();
    render(<AutomationsScreen client={libraryClient()} />);
    await user.click(screen.getByRole("button", { name: "Select Verification folder" }));
    expect(screen.getByRole("region", { name: "Verification tasks" }))
      .not.toHaveTextContent("Export monthly report");
    await user.click(screen.getByRole("button", { name: "Select Inbox folder" }));
    expect(screen.getByRole("region", { name: "Inbox tasks" }))
      .toHaveTextContent("Export monthly report");
  });

  it("keeps demo folders usable when the Library is empty, invalid, or unavailable", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AutomationsScreen client={libraryClient({ workflows: [], invalidFileCount: 2 })} />,
    );

    expect(await screen.findByText("No saved workflows.")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("2 workflow files could not be loaded");
    expect(screen.getByRole("button", { name: "Select All workflows folder" })).toHaveTextContent("All workflows");

    rerender(<AutomationsScreen client={{ list: vi.fn(async () => {
      throw new Error("offline");
    }) }} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("All workflows could not be loaded");
    await user.click(screen.getByRole("button", { name: "Select Verification folder" }));
    expect(screen.getByRole("region", { name: "Verification tasks" })).toHaveTextContent("Find customer");
  });
});
