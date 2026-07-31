import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationsScreen } from "@/features/automations";

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AutomationsScreen", () => {
  it("presents the selected folder, mock activity, and side-effect-free controls", () => {
    render(<AutomationsScreen />);

    expect(screen.getByRole("heading", { name: "Automations", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Demo data—changes reset on refresh.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Automations" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Select Verification folder" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const tasks = screen.getByRole("region", { name: "Verification tasks" });
    expect(within(tasks).getAllByRole("row")).toHaveLength(9);
    expect(within(tasks).getByRole("row", { name: /Find customer/ })).toHaveTextContent("8 steps");

    const activity = screen.getByRole("region", { name: "Run activity" });
    expect(within(activity).getByText("Running · Step 3 of 8")).toBeInTheDocument();
    expect(within(activity).getByText("Salesforce connection timed out")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "New folder" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Run folder" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled();
  });

  it("selects folders, aggregates nested tasks, and toggles branches", async () => {
    const user = userEvent.setup();
    render(<AutomationsScreen />);

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
    render(<AutomationsScreen />);

    await user.click(screen.getByRole("button", { name: "New folder" }));
    expect(screen.getByRole("dialog", { name: "Create folder" })).toBeInTheDocument();
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
    render(<AutomationsScreen />);

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
    render(<AutomationsScreen />);

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
    render(<AutomationsScreen />);

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
    const firstRender = render(<AutomationsScreen />);

    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.click(screen.getByRole("button", { name: "Add task to Verification" }));
    expect(screen.getByRole("region", { name: "Verification tasks" }))
      .toHaveTextContent("Export monthly report");

    firstRender.unmount();
    render(<AutomationsScreen />);
    expect(screen.getByRole("region", { name: "Verification tasks" }))
      .not.toHaveTextContent("Export monthly report");
    await user.click(screen.getByRole("button", { name: "Select Inbox folder" }));
    expect(screen.getByRole("region", { name: "Inbox tasks" }))
      .toHaveTextContent("Export monthly report");
  });
});
