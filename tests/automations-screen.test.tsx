import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationsScreen } from "@/features/automations";

afterEach(cleanup);

describe("AutomationsScreen", () => {
  it("presents the automation workspace from mock data without executable actions", () => {
    render(<AutomationsScreen />);

    expect(screen.getByRole("heading", { name: "Automations", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Automations" })).toHaveAttribute("aria-current", "page");

    const folders = screen.getByRole("region", { name: "Automation folders" });
    expect(within(folders).getByText("Customers")).toBeInTheDocument();
    expect(within(folders).getByText("Verification")).toHaveAttribute("aria-current", "true");
    expect(within(folders).getByText("8")).toBeInTheDocument();

    const tasks = screen.getByRole("region", { name: "Customer Verification tasks" });
    expect(within(tasks).getAllByRole("row")).toHaveLength(9);
    expect(within(tasks).getByRole("row", { name: /Find customer/ })).toHaveTextContent("8 steps");
    expect(within(tasks).getByRole("row", { name: /Archive documents/ })).toHaveTextContent("Updated 5h ago");

    const activity = screen.getByRole("region", { name: "Run activity" });
    expect(within(activity).getByText("Running · Step 3 of 8")).toBeInTheDocument();
    expect(within(activity).getByText("Failed at step 4")).toBeInTheDocument();
    expect(within(activity).getByText("Salesforce connection timed out")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "New folder" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run folder" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /Remove .* from folder/ })).toHaveLength(8);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
