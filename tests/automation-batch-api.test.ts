import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAutomationBatchService,
  handleAutomationBatchApi,
  type AutomationBatchService,
} from "@/server/automation/http-router";
import {
  WorkflowNotFoundError,
  type WorkflowRepository,
} from "@/server/workflows/repository";
import { createWorkflow } from "@/shared/contracts/workflow/schema";
import type { Workflow } from "@/shared/contracts/workflow/domain";

const servers: Server[] = [];

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind.");
  return `http://127.0.0.1:${address.port}/`;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function completeWorkflow(parameterSource?: "profile" | "runtime"): Workflow {
  const workflow = createWorkflow();
  workflow.name = "Checkout";
  workflow.status = "complete";
  workflow.steps = parameterSource ? [{
    id: crypto.randomUUID(),
    order: 0,
    name: "Enter value",
    enabled: true,
    type: "fill",
    page: { id: "page", url: "https://example.com" },
    target: { candidates: [{ kind: "label", value: "Value", exact: true }] },
    payload: { value: "" },
    parameterBinding: parameterSource === "profile"
      ? { source: "profile", field: "identity.email" }
      : { source: "runtime" },
    metadata: { recordedAt: new Date().toISOString(), origin: "manual", sensitive: false },
  }] : [{
    id: crypto.randomUUID(),
    order: 0,
    name: "Open checkout",
    enabled: true,
    type: "navigate",
    page: { id: "page", url: "https://example.com" },
    payload: { url: "https://example.com" },
    metadata: { recordedAt: new Date().toISOString(), origin: "manual", sensitive: false },
  }];
  return workflow;
}

function workflowRepository(workflows: Workflow[]): WorkflowRepository {
  const byId = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const unsupported = async () => { throw new Error("Not used by this test."); };
  return {
    list: unsupported,
    create: unsupported,
    get: async (id) => {
      const workflow = byId.get(id);
      if (!workflow) throw new WorkflowNotFoundError();
      return workflow;
    },
    save: unsupported,
    finish: unsupported,
  };
}

async function api(repository: WorkflowRepository, service: AutomationBatchService | null) {
  const url = await listen((request, response) => {
    void handleAutomationBatchApi(request, response, repository, service).then((handled) => {
      if (!handled) {
        response.statusCode = 404;
        response.end();
      }
    });
  });
  return url;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("Relay batch service", () => {
  it("creates and polls an authenticated batch without retrying", async () => {
    const workflow = completeWorkflow();
    const requests: Array<{ method: string; url: string; authorization?: string; body?: unknown }> = [];
    const baseUrl = await listen((request, response) => {
      void readJson(request).catch(() => undefined).then((body) => {
        requests.push({
          method: request.method ?? "",
          url: request.url ?? "",
          authorization: request.headers.authorization,
          body,
        });
        response.statusCode = request.method === "POST" ? 202 : 200;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(request.method === "POST"
          ? { batchId: crypto.randomUUID(), runCount: 1 }
          : {
            batchId: request.url?.split("/").at(-1),
            runs: [{
              workflowId: workflow.id,
              status: "running",
              currentStep: 1,
              totalSteps: 1,
            }],
          }));
      });
    });
    const client = createAutomationBatchService({
      AUTOMATION_SERVICE_BASE_URL: baseUrl,
      AUTOMATION_SERVICE_TOKEN: "relay-secret",
    })!;

    const created = await client.create([workflow]);
    const snapshot = await client.get(created.batchId);

    expect(created.runCount).toBe(1);
    expect(snapshot.runs[0]).toMatchObject({ workflowId: workflow.id, status: "running" });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      method: "POST",
      url: "/v1/batches",
      authorization: "Bearer relay-secret",
      body: { runs: [{ workflow }] },
    });
    expect(requests[1]).toMatchObject({
      method: "GET",
      url: `/v1/batches/${created.batchId}`,
      authorization: "Bearer relay-secret",
    });
  });

  it("rejects malformed success responses without exposing their contents", async () => {
    const baseUrl = await listen((_request, response) => {
      response.statusCode = 202;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ batchId: "private-backend-value", workflow: { secret: true } }));
    });

    const client = createAutomationBatchService({
      AUTOMATION_SERVICE_BASE_URL: baseUrl,
      AUTOMATION_SERVICE_TOKEN: "token",
    })!;
    await expect(client.create([completeWorkflow()]))
      .rejects.toMatchObject({ status: 502, message: "The automation service returned an invalid response." });
  });

  it("normalizes Relay-native polling snapshots and strips diagnostics", async () => {
    const first = completeWorkflow();
    const second = completeWorkflow();
    const batchId = crypto.randomUUID();
    const baseUrl = await listen((_request, response) => {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        batchId,
        runs: [
          { workflowId: first.id, status: "queued" },
          {
            workflowId: second.id,
            status: "failed",
            currentStep: 2,
            totalSteps: 3,
            passedSteps: 2,
            skippedSteps: 0,
            durationMs: 5_401,
            failedStepId: crypto.randomUUID(),
            failedStepIndex: 2,
            phase: "asserting",
            code: "automation_failed",
          },
        ],
      }));
    });
    const client = createAutomationBatchService({
      AUTOMATION_SERVICE_BASE_URL: baseUrl,
      AUTOMATION_SERVICE_TOKEN: "relay-secret",
    })!;

    await expect(client.get(batchId)).resolves.toEqual({
      batchId,
      runs: [
        { workflowId: first.id, status: "queued", currentStep: 0, totalSteps: 0 },
        { workflowId: second.id, status: "failed", currentStep: 2, totalSteps: 3 },
      ],
    });
  });

  it.each([
    {
      name: "an invalid batch ID",
      body: (_batchId: string, workflowId: string) => ({
        batchId: "not-a-uuid",
        runs: [{ workflowId, status: "queued" }],
      }),
    },
    {
      name: "an invalid workflow ID",
      body: (batchId: string) => ({
        batchId,
        runs: [{ workflowId: "not-a-uuid", status: "queued" }],
      }),
    },
    {
      name: "an invalid status",
      body: (batchId: string, workflowId: string) => ({
        batchId,
        runs: [{ workflowId, status: "paused" }],
      }),
    },
    {
      name: "only one progress counter",
      body: (batchId: string, workflowId: string) => ({
        batchId,
        runs: [{ workflowId, status: "running", currentStep: 1 }],
      }),
    },
    {
      name: "progress beyond the total",
      body: (batchId: string, workflowId: string) => ({
        batchId,
        runs: [{ workflowId, status: "running", currentStep: 2, totalSteps: 1 }],
      }),
    },
  ])("rejects Relay polling snapshots with $name", async ({ body }) => {
    const batchId = crypto.randomUUID();
    const workflowId = crypto.randomUUID();
    const baseUrl = await listen((_request, response) => {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(body(batchId, workflowId)));
    });
    const client = createAutomationBatchService({
      AUTOMATION_SERVICE_BASE_URL: baseUrl,
      AUTOMATION_SERVICE_TOKEN: "relay-secret",
    })!;

    await expect(client.get(batchId))
      .rejects.toMatchObject({ status: 502, message: "The automation service returned an invalid response." });
  });

  it("returns no client for missing configuration and validates configured URLs", () => {
    expect(createAutomationBatchService({})).toBeNull();
    expect(createAutomationBatchService({ AUTOMATION_SERVICE_BASE_URL: "https://relay.example.test" })).toBeNull();
    expect(() => createAutomationBatchService({
      AUTOMATION_SERVICE_BASE_URL: "file:///tmp/relay",
      AUTOMATION_SERVICE_TOKEN: "secret",
    })).toThrow("AUTOMATION_SERVICE_BASE_URL");
  });
});

describe("automation batch HTTP API", () => {
  it("loads complete workflows in request order and returns a safe create response", async () => {
    const first = completeWorkflow();
    const second = completeWorkflow();
    const batchId = crypto.randomUUID();
    const create = vi.fn(async () => ({ batchId, runCount: 2 }));
    const service: AutomationBatchService = { create, get: vi.fn() };
    const url = await api(workflowRepository([first, second]), service);

    const response = await fetch(`${url}api/run-batches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflowIds: [second.id, first.id] }),
    });

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ batchId, runCount: 2 });
    expect(create).toHaveBeenCalledWith([second, first]);
  });

  it.each([
    { name: "duplicate IDs", body: (id: string) => ({ workflowIds: [id, id] }) },
    { name: "an empty list", body: () => ({ workflowIds: [] }) },
    { name: "an unknown field", body: (id: string) => ({ workflowIds: [id], extra: true }) },
  ])("rejects $name before creating a Relay batch", async ({ body }) => {
    const workflow = completeWorkflow();
    const create = vi.fn();
    const url = await api(workflowRepository([workflow]), { create, get: vi.fn() });

    const response = await fetch(`${url}api/run-batches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body(workflow.id)),
    });

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    { name: "draft", workflow: () => createWorkflow() },
    { name: "profile parameters", workflow: () => completeWorkflow("profile") },
    { name: "runtime parameters", workflow: () => completeWorkflow("runtime") },
  ])("rejects a $name workflow before creating a Relay batch", async ({ workflow: makeWorkflow }) => {
    const workflow = makeWorkflow();
    const create = vi.fn();
    const url = await api(workflowRepository([workflow]), { create, get: vi.fn() });

    const response = await fetch(`${url}api/run-batches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflowIds: [workflow.id] }),
    });

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("proxies a safe polling snapshot and disables routes when unconfigured", async () => {
    const workflow = completeWorkflow();
    const batchId = crypto.randomUUID();
    const snapshot = {
      batchId,
      runs: [{
        workflowId: workflow.id,
        status: "completed" as const,
        currentStep: 1,
        totalSteps: 1,
      }],
    };
    const get = vi.fn(async () => snapshot);
    const repository = workflowRepository([workflow]);
    const configuredUrl = await api(repository, { create: vi.fn(), get });
    const unavailableUrl = await api(repository, null);

    const response = await fetch(`${configuredUrl}api/run-batches/${batchId}`);
    const unavailable = await fetch(`${unavailableUrl}api/run-batches/${batchId}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(snapshot);
    expect(get).toHaveBeenCalledWith(batchId);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: "Background runs are not configured." });
  });
});
