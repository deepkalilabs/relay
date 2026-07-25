import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { LibraryScreen, mockRecordings } from "@/features/library";

afterEach(cleanup);

describe("LibraryScreen", () => {
  it("renders the mock library with Checkout flow selected", () => {
    render(<LibraryScreen recordings={mockRecordings} />);

    expect(screen.getByRole("heading", { name: "Library", level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Select .* recording/ })).toHaveLength(6);

    const details = screen.getByRole("region", { name: "Recording details" });
    expect(within(details).getByRole("heading", { name: "Checkout flow" })).toBeInTheDocument();
    expect(within(details).getByText("Open checkout")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Checkout flow recording" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("updates the details when another recording is selected", async () => {
    const user = userEvent.setup();
    render(<LibraryScreen recordings={mockRecordings} />);

    await user.click(screen.getByRole("button", { name: "Select Create support ticket recording" }));

    const details = screen.getByRole("region", { name: "Recording details" });
    expect(within(details).getByRole("heading", { name: "Create support ticket" })).toBeInTheDocument();
    expect(within(details).getByText("Open the support portal")).toBeInTheDocument();
  });

  it("filters recordings case-insensitively and selects the first visible match", async () => {
    const user = userEvent.setup();
    render(<LibraryScreen recordings={mockRecordings} />);

    await user.type(screen.getByRole("searchbox", { name: "Search recordings" }), "WEEKLY");

    expect(screen.getAllByRole("button", { name: /Select .* recording/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Select Weekly analytics export recording" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Recording details" })).getByRole("heading", {
        name: "Weekly analytics export",
      }),
    ).toBeInTheDocument();
  });

  it("shows a useful empty state when search has no matches", async () => {
    const user = userEvent.setup();
    render(<LibraryScreen recordings={mockRecordings} />);

    await user.type(screen.getByRole("searchbox", { name: "Search recordings" }), "not a workflow");

    expect(screen.getByRole("status")).toHaveTextContent("No recordings match");
    expect(screen.queryByRole("region", { name: "Recording details" })).not.toBeInTheDocument();
  });

  it("keeps route navigation available while mock recording actions remain disabled", () => {
    render(<LibraryScreen recordings={mockRecordings} />);

    expect(screen.getByRole("link", { name: "Recorder" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "New recording" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Run Checkout flow" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open Checkout flow" })).toBeDisabled();
  });
});
