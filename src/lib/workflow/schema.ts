import { z } from "zod";
import {
  locatorCandidatesForTarget,
  locatorKinds,
  type ElementTarget,
  type LocatorCandidate,
  type ReplayWait,
  type ViewportPosition,
  type Workflow,
  type WorkflowStep,
} from "@/lib/workflow/domain";

export const LocatorCandidateSchema = z.object({
  kind: z.enum(locatorKinds),
  value: z.string().min(1),
  name: z.string().optional(),
  exact: z.boolean().default(true),
  unique: z.boolean().optional(),
}) satisfies z.ZodType<LocatorCandidate>;

export const ElementTargetSchema = z.object({
  selector: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  tagName: z.string().optional(),
  inputType: z.string().optional(),
  frameUrl: z.string().optional(),
  candidates: z.array(LocatorCandidateSchema).optional(),
}) satisfies z.ZodType<ElementTarget>;

/** @deprecated Use ElementTargetSchema for new code. */
export const TargetDescriptorSchema = ElementTargetSchema;

export const ReplayWaitSchema = z.object({
  delayMs: z.number().int().min(0).max(30_000).optional(),
  condition: z.object({
    state: z.enum(["visible", "hidden"]),
    target: ElementTargetSchema.refine(
      (target) => locatorCandidatesForTarget(target).length > 0,
      "Replay wait conditions need at least one locator.",
    ),
  }).optional(),
}).refine(
  (wait) => (wait.delayMs ?? 0) > 0 || Boolean(wait.condition),
  "Configure a delay or element condition for this replay wait.",
) satisfies z.ZodType<ReplayWait>;

const PageDescriptorSchema = z.object({
  id: z.string().min(1),
  url: z.string(),
  title: z.string().optional(),
});

const StepMetadataSchema = z.object({
  recordedAt: z.string().datetime(),
  origin: z.enum(["recorded", "manual"]),
  sensitive: z.boolean(),
});

export const ViewportPositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  frameUrl: z.string().optional(),
}) satisfies z.ZodType<ViewportPosition>;

const StepBase = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  name: z.string().trim().min(1, "Give this step a name."),
  enabled: z.boolean(),
  page: PageDescriptorSchema,
  target: ElementTargetSchema.optional(),
  position: ViewportPositionSchema.optional(),
  waitAfter: ReplayWaitSchema.optional(),
  metadata: StepMetadataSchema,
});

const ElementStepBase = StepBase.extend({
  target: ElementTargetSchema.refine(
    (target) => locatorCandidatesForTarget(target).length > 0,
    "Element actions need at least one locator.",
  ),
});

export const WorkflowStepSchema = z.discriminatedUnion("type", [
  StepBase.extend({
    type: z.literal("navigate"),
    payload: z.object({ url: z.string().min(1, "Enter a destination URL.") }),
  }),
  ElementStepBase.extend({
    type: z.literal("click"),
    payload: z.object({}).optional(),
  }),
  ElementStepBase.extend({
    type: z.literal("fill"),
    payload: z.object({ value: z.string() }),
  }),
  ElementStepBase.extend({
    type: z.literal("set_date"),
    payload: z.object({ value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD for dates.") }),
  }),
  ElementStepBase.extend({
    type: z.literal("select"),
    payload: z.object({ value: z.string(), label: z.string().optional() }),
  }),
  ElementStepBase.extend({
    type: z.literal("check"),
    payload: z.object({}).optional(),
  }),
  ElementStepBase.extend({
    type: z.literal("uncheck"),
    payload: z.object({}).optional(),
  }),
  ElementStepBase.extend({
    type: z.literal("keypress"),
    payload: z.object({
      key: z.string().min(1, "Enter a key."),
      modifiers: z.array(z.enum(["Alt", "Control", "Meta", "Shift"])),
    }),
  }),
  ElementStepBase.extend({
    type: z.literal("submit"),
    payload: z.object({}).optional(),
  }),
]) satisfies z.ZodType<WorkflowStep>;

export const WorkflowSchema = z.object({
  schemaVersion: z.literal("1.1"),
  id: z.string().min(1),
  name: z.string().trim().min(1, "Give this workflow a name."),
  status: z.enum(["draft", "complete"]),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  source: z.object({
    provider: z.literal("browserbase"),
    sessionId: z.string(),
    startUrl: z.string().optional(),
  }),
  steps: z.array(WorkflowStepSchema),
}) satisfies z.ZodType<Workflow>;

const LegacyWorkflowSchema = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string().min(1),
  name: z.string().trim().min(1, "Give this workflow a name."),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  source: z.object({
    provider: z.literal("browserbase"),
    sessionId: z.string(),
    startUrl: z.string().optional(),
  }),
  steps: z.array(WorkflowStepSchema),
});

export const CompatibleWorkflowSchema = z.discriminatedUnion(
  "schemaVersion",
  [WorkflowSchema, LegacyWorkflowSchema],
).transform(
  (workflow): Workflow => workflow.schemaVersion === "1.1"
    ? workflow
    : {
        ...workflow,
        schemaVersion: "1.1",
        status: "complete",
        revision: 1,
        finishedAt: workflow.updatedAt,
      },
);

const locatorPriority = new Map(locatorKinds.map((kind, index) => [kind, index]));

export function orderLocatorCandidates(candidates: LocatorCandidate[]): LocatorCandidate[] {
  return [...candidates].sort(
    (left, right) => (locatorPriority.get(left.kind) ?? 99) - (locatorPriority.get(right.kind) ?? 99),
  );
}

export const emptyTarget = (): ElementTarget => ({
  candidates: [{ kind: "css", value: "body", exact: true, unique: true }],
});

export function createWorkflow(sessionId = ""): Workflow {
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.1",
    id: crypto.randomUUID(),
    name: "Untitled recording",
    status: "draft",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    source: { provider: "browserbase", sessionId },
    steps: [],
  };
}
