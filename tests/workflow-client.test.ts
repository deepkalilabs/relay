import { afterEach, describe, expect, it, vi } from "vitest";
import { workflowEditorClient } from "@/lib/workflow/client";
import { createWorkflow } from "@/lib/workflow/schema";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("workflow editor client", () => {
  it("loads a complete workflow by ID", async () => {
    const workflow = createWorkflow();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(workflow), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(workflowEditorClient.get(workflow.id)).resolves.toEqual(workflow);
    expect(fetchMock).toHaveBeenCalledWith(`/api/workflows/${workflow.id}`);
  });

  it("sends the workflow and expected revision on explicit saves", async () => {
    const workflow = createWorkflow();
    const saved = { ...workflow, revision: workflow.revision + 1 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(saved), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(workflowEditorClient.save(workflow.id, workflow, workflow.revision)).resolves.toEqual(saved);
    expect(fetchMock).toHaveBeenCalledWith(`/api/workflows/${workflow.id}`, expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ workflow, expectedRevision: workflow.revision }),
    }));
  });

  it("exposes revision conflicts without discarding the local workflow", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "The workflow changed on disk." }),
      { status: 409, headers: { "content-type": "application/json" } },
    )));

    const workflow = createWorkflow();
    const request = workflowEditorClient.save(workflow.id, workflow, workflow.revision);

    await expect(request).rejects.toMatchObject({
      status: 409,
      message: "The workflow changed on disk.",
    });
  });
});
