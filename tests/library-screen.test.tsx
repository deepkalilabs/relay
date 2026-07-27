import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryScreen, type WorkflowLibraryClient } from "@/features/library";
import type { LibraryWorkflowItem } from "@/lib/workflow/library";
import { createWorkflow } from "@/lib/workflow/schema";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const workflows: LibraryWorkflowItem[] = [
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
];

function client(overrides: Partial<WorkflowLibraryClient> = {}): WorkflowLibraryClient {
  return {
    list: vi.fn(async () => ({ workflows, invalidFileCount: 0 })),
    create: vi.fn(async () => createWorkflow()),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("LibraryScreen", () => {
  it("loads real workflow names and ordered step names with a static preview", async () => {
    render(<LibraryScreen client={client()} initialSelectedId="checkout-flow" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading workflows");
    expect(await screen.findByRole("heading", { name: "Library", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Select Checkout flow workflow" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const details = screen.getByRole("region", { name: "Workflow details" });
    expect(within(details).getByRole("heading", { name: "Checkout flow" })).toBeInTheDocument();
    expect(within(details).getByText("Open checkout")).toBeInTheDocument();
    expect(within(details).getByText("Enter contact information")).toBeInTheDocument();
    expect(within(details).getByText("Draft")).toBeInTheDocument();
    expect(within(details).getByTestId("static-workflow-preview")).toBeInTheDocument();
    expect(within(details).getByRole("link", { name: "Continue editing Checkout flow" })).toHaveAttribute(
      "href",
      "/workflows/checkout-flow/edit",
    );
    expect(within(details).queryByRole("button", { name: /run/i })).not.toBeInTheDocument();
  });

  it("updates details and filters workflows case-insensitively", async () => {
    const user = userEvent.setup();
    render(<LibraryScreen client={client()} />);
    await screen.findByRole("button", { name: "Select Create support ticket workflow" });

    await user.click(screen.getByRole("button", { name: "Select Create support ticket workflow" }));
    expect(screen.getByRole("region", { name: "Workflow details" })).toHaveTextContent("Open the support portal");
    expect(screen.getByRole("link", { name: "Edit workflow Create support ticket" })).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search workflows" }), "CHECKOUT");
    expect(screen.getAllByRole("button", { name: /Select .* workflow/ })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Checkout flow" })).toBeInTheDocument();
  });

  it("creates a durable draft before navigating to its editor", async () => {
    const user = userEvent.setup();
    const created = createWorkflow();
    created.id = "new-workflow";
    const create = vi.fn(async () => created);
    render(<LibraryScreen client={client({ create })} />);
    await screen.findByRole("button", { name: "New recording" });

    await user.click(screen.getByRole("button", { name: "New recording" }));

    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(push).toHaveBeenCalledWith("/workflows/new-workflow/edit");
  });

  it("shows empty, invalid-file warning, and load-failure states", async () => {
    const emptyClient = client({
      list: vi.fn(async () => ({ workflows: [], invalidFileCount: 2 })),
    });
    const { rerender } = render(<LibraryScreen client={emptyClient} />);

    expect(await screen.findByRole("heading", { name: "No saved workflows" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("2 workflow files could not be loaded");

    rerender(<LibraryScreen client={client({ list: vi.fn(async () => {
      throw new Error("offline");
    }) })} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Library could not be loaded");
  });
});
