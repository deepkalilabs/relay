import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileScreen } from "@/features/profile";

afterEach(cleanup);

describe("ProfileScreen", () => {
  it("renders the static selected profile and its reusable browser details", () => {
    render(<ProfileScreen />);

    expect(screen.getByRole("heading", { name: "Profiles", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Create reusable parameters for your workflow runs.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: "Profiles" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("link", { name: "Profiles" })).toHaveAttribute("aria-current", "page");

    const profileList = screen.getByRole("region", { name: "Saved profiles" });
    expect(within(profileList).getByText("Personal")).toBeInTheDocument();
    expect(within(profileList).getByText("Work — US")).toBeInTheDocument();
    expect(within(profileList).getByText("QA Test")).toBeInTheDocument();
    expect(within(profileList).getByText("Work — US").closest("li")).toHaveAttribute("aria-current", "true");

    const details = screen.getByRole("region", { name: "Work — US profile details" });
    expect(within(details).getByText("Ready")).toBeInTheDocument();
    expect(within(details).getByLabelText("Full name")).toHaveValue("Alex Johnson");
    expect(within(details).getByLabelText("Email address")).toHaveValue("alex.johnson@acmecorp.com");
    expect(within(details).getByLabelText("Country/region")).toHaveValue("United States");
    expect(within(details).getByLabelText("ZIP code")).toHaveValue("94103");
    expect(within(details).getByRole("textbox", { name: "Browser" })).toHaveValue("Google Chrome 125");
    expect(within(details).getByLabelText("Operating system")).toHaveValue("Windows 11");
    expect(screen.queryByRole("button", { name: "New recording" })).not.toBeInTheDocument();
  });

  it("keeps prototype controls inert", async () => {
    const user = userEvent.setup();
    render(<ProfileScreen />);

    const controls = [
      screen.getByRole("button", { name: "New profile" }),
      screen.getByRole("button", { name: "Delete" }),
      screen.getByRole("button", { name: "Save profile" }),
      screen.getByRole("button", { name: "Run a workflow with this profile" }),
    ];

    for (const control of controls) {
      expect(control).toHaveAttribute("aria-disabled", "true");
      await user.click(control);
    }

    expect(screen.getByLabelText("Full name")).toHaveValue("Alex Johnson");
  });
});
