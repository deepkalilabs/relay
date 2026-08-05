import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { Workflow } from "@/shared/contracts/workflow/domain";
import {
  WorkflowNotFoundError,
  WorkflowUnavailableError,
  WorkflowValidationError,
  type WorkflowRepository,
} from "@/server/workflows/repository";

const CreateRequest = z.object({
  workflowIds: z.array(z.uuid()).min(1).max(10),
}).strict().refine(
  ({ workflowIds }) => new Set(workflowIds).size === workflowIds.length,
  "Workflow IDs must be unique.",
);
const CreateResponse = z.object({
  batchId: z.uuid(),
  runCount: z.number().int().min(1).max(10),
}).strict();
const RelayRunSnapshot = z.object({
  workflowId: z.uuid(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  currentStep: z.number().int().nonnegative().optional(),
  totalSteps: z.number().int().nonnegative().optional(),
}).refine((run) => {
  if (run.currentStep === undefined || run.totalSteps === undefined) {
    return run.currentStep === run.totalSteps;
  }
  return run.currentStep <= run.totalSteps;
});
const RelayPollResponse = z.object({
  batchId: z.uuid(),
  runs: z.array(RelayRunSnapshot).min(1).max(10),
}).strict().transform(({ batchId, runs }) => ({
  batchId,
  runs: runs.map((run) => ({
    workflowId: run.workflowId,
    status: run.status,
    currentStep: run.currentStep ?? 0,
    totalSteps: run.totalSteps ?? 0,
  })),
}));

type CreateResult = z.infer<typeof CreateResponse>;
type PollResult = z.infer<typeof RelayPollResponse>;

export interface AutomationBatchService {
  create(workflows: Workflow[]): Promise<CreateResult>;
  get(batchId: string): Promise<PollResult>;
}

class SafeBatchError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function parseBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("AUTOMATION_SERVICE_BASE_URL must be a valid HTTP or HTTPS URL.");
  }
  if (!(["http:", "https:"] as string[]).includes(url.protocol)
    || url.username || url.password || url.search || url.hash) {
    throw new Error("AUTOMATION_SERVICE_BASE_URL must be a safe HTTP or HTTPS URL.");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

export function createAutomationBatchService(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  fetchRelay: typeof fetch = globalThis.fetch,
): AutomationBatchService | null {
  const baseUrlValue = environment.AUTOMATION_SERVICE_BASE_URL?.trim();
  const token = environment.AUTOMATION_SERVICE_TOKEN?.trim();
  if (!baseUrlValue || !token) return null;
  const baseUrl = parseBaseUrl(baseUrlValue);

  const request = async <T>(pathname: string, init: RequestInit, status: number, schema: z.ZodType<T>) => {
    let response: Response;
    try {
      response = await fetchRelay(new URL(pathname, baseUrl), {
        ...init,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          ...init.headers,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new SafeBatchError(503, "The automation service is unavailable.");
    }
    if (response.status === 404) throw new SafeBatchError(404, "The background run was not found.");
    if (response.status !== status) throw new SafeBatchError(503, "The automation service is unavailable.");
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new SafeBatchError(502, "The automation service returned an invalid response.");
    return parsed.data;
  };

  return {
    create: (workflows) => request("v1/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runs: workflows.map((workflow) => ({ workflow })) }),
    }, 202, CreateResponse),
    get: (batchId) => request(
      `v1/batches/${encodeURIComponent(batchId)}`,
      { method: "GET" },
      200,
      RelayPollResponse,
    ),
  };
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new SafeBatchError(400, "The background run request is invalid.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 4_096) throw new SafeBatchError(400, "The background run request is invalid.");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new SafeBatchError(400, "The background run request is invalid.");
  }
}

function assertRunnable(workflow: Workflow): void {
  const needsParameters = workflow.steps.some((step) => step.enabled && step.type === "fill"
    && (step.parameterBinding.source === "profile" || step.parameterBinding.source === "runtime"));
  if (workflow.status !== "complete" || needsParameters) {
    throw new SafeBatchError(400, "The background run request is invalid.");
  }
}

function safeError(error: unknown): SafeBatchError {
  if (error instanceof SafeBatchError) return error;
  if (error instanceof WorkflowNotFoundError || error instanceof WorkflowValidationError || error instanceof z.ZodError) {
    return new SafeBatchError(400, "The background run request is invalid.");
  }
  if (error instanceof WorkflowUnavailableError) {
    return new SafeBatchError(503, "Workflow storage is temporarily unavailable.");
  }
  return new SafeBatchError(500, "The background run request failed.");
}

export async function handleAutomationBatchApi(
  request: IncomingMessage,
  response: ServerResponse,
  repository: WorkflowRepository,
  service: AutomationBatchService | null,
): Promise<boolean> {
  const segments = new URL(request.url ?? "/", "http://localhost").pathname.split("/").filter(Boolean);
  if (segments[0] !== "api" || segments[1] !== "run-batches") return false;
  if (!service) {
    sendJson(response, 503, { error: "Background runs are not configured." });
    return true;
  }
  try {
    if (segments.length === 2 && request.method === "POST") {
      const { workflowIds } = CreateRequest.parse(await readJson(request));
      const workflows = await Promise.all(workflowIds.map((id) => repository.get(id)));
      workflows.forEach(assertRunnable);
      sendJson(response, 202, await service.create(workflows));
      return true;
    }
    if (segments.length === 3 && request.method === "GET") {
      sendJson(response, 200, await service.get(z.uuid().parse(segments[2])));
      return true;
    }
    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    const safe = safeError(error);
    sendJson(response, safe.status, { error: safe.message });
  }
  return true;
}
