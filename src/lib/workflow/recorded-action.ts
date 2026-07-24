import { z } from "zod";
import type { WorkflowStep } from "@/lib/workflow/domain";
import { ElementTargetSchema, ViewportPositionSchema } from "@/lib/workflow/schema";

export const RecordedActionSchema = z.object({
  type: z.enum([
    "navigate",
    "click",
    "fill",
    "set_date",
    "select",
    "check",
    "uncheck",
    "keypress",
    "submit",
  ]),
  name: z.string().min(1),
  target: ElementTargetSchema.optional(),
  position: ViewportPositionSchema.optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  sensitive: z.boolean().default(false),
  page: z.object({
    id: z.string(),
    url: z.string(),
    title: z.string().optional(),
  }),
  recordedAt: z.string().datetime(),
});

export type RecordedAction = z.infer<typeof RecordedActionSchema>;

export function isSensitiveInput(inputType?: string, autocomplete?: string): boolean {
  const combined = `${inputType ?? ""} ${autocomplete ?? ""}`.toLowerCase();
  return /(password|current-password|new-password|one-time-code|cc-|credit|card|token|secret)/.test(
    combined,
  );
}

export function stepFromRecordedAction(action: RecordedAction, order: number): WorkflowStep {
  const common = {
    id: crypto.randomUUID(),
    order,
    name: action.name,
    enabled: true,
    page: action.page,
    target: action.target,
    position: action.position,
    metadata: {
      recordedAt: action.recordedAt,
      origin: "recorded" as const,
      sensitive: action.sensitive,
    },
  };

  switch (action.type) {
    case "navigate":
      return { ...common, type: "navigate", payload: { url: String(action.payload?.url ?? action.page.url) } };
    case "fill":
      return { ...common, type: "fill", target: action.target!, payload: { value: String(action.payload?.value ?? "") } };
    case "set_date":
      return { ...common, type: "set_date", target: action.target!, payload: { value: String(action.payload?.value ?? "") } };
    case "select":
      return {
        ...common,
        type: "select",
        target: action.target!,
        payload: {
          value: String(action.payload?.value ?? ""),
          label: action.payload?.label ? String(action.payload.label) : undefined,
        },
      };
    case "keypress":
      return {
        ...common,
        type: "keypress",
        target: action.target!,
        payload: {
          key: String(action.payload?.key ?? "Enter"),
          modifiers: Array.isArray(action.payload?.modifiers)
            ? (action.payload.modifiers as ("Alt" | "Control" | "Meta" | "Shift")[])
            : [],
        },
      };
    case "click":
    case "check":
    case "uncheck":
    case "submit":
      return { ...common, type: action.type, target: action.target! } as WorkflowStep;
  }
}
