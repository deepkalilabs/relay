import { z } from "zod";

export const locatorKinds = [
  "testId",
  "role",
  "accessibleName",
  "label",
  "text",
  "css",
  "xpath",
] as const;

export const LocatorCandidateSchema = z.object({
  kind: z.enum(locatorKinds),
  value: z.string().min(1),
  name: z.string().optional(),
  exact: z.boolean().default(true),
  unique: z.boolean().optional(),
});

export type LocatorCandidate = z.infer<typeof LocatorCandidateSchema>;

export const TargetDescriptorSchema = z.object({
  tagName: z.string().optional(),
  inputType: z.string().optional(),
  frameUrl: z.string().optional(),
  candidates: z.array(LocatorCandidateSchema),
});

const PageDescriptorSchema = z.object({
  id: z.string().min(1),
  url: z.string(),
  title: z.string().optional(),
});

const StepMetadataSchema = z.object({
  recordedAt: z.string().datetime(),
  origin: z.enum(["recorded", "manual", "duplicate"]),
  sensitive: z.boolean(),
});

const StepBase = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  name: z.string().trim().min(1, "Give this step a name."),
  enabled: z.boolean(),
  page: PageDescriptorSchema,
  target: TargetDescriptorSchema.optional(),
  metadata: StepMetadataSchema,
});

const ElementStepBase = StepBase.extend({
  target: TargetDescriptorSchema.refine(
    (target) => target.candidates.length > 0,
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
]);

export const WorkflowSchema = z.object({
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

export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type WorkflowActionType = WorkflowStep["type"];
export type TargetDescriptor = z.infer<typeof TargetDescriptorSchema>;

const locatorPriority = new Map(locatorKinds.map((kind, index) => [kind, index]));

export function orderLocatorCandidates(candidates: LocatorCandidate[]): LocatorCandidate[] {
  return [...candidates].sort(
    (left, right) => (locatorPriority.get(left.kind) ?? 99) - (locatorPriority.get(right.kind) ?? 99),
  );
}

export const emptyTarget = (): TargetDescriptor => ({
  candidates: [{ kind: "css", value: "body", exact: true, unique: true }],
});

export function createWorkflow(sessionId = ""): Workflow {
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.0",
    id: crypto.randomUUID(),
    name: "Untitled recording",
    createdAt: now,
    updatedAt: now,
    source: { provider: "browserbase", sessionId },
    steps: [],
  };
}
