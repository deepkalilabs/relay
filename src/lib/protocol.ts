import { z } from "zod";
import { RecordedActionSchema } from "@/lib/workflow/recorded-action";
import { WorkflowSchema } from "@/lib/workflow/schema";

const DatePickerRequestIdSchema = z.string().uuid();

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("client.hello"), clientId: z.string().uuid(), lastSequence: z.number().int().nonnegative() }),
  z.object({ type: z.literal("session.start") }),
  z.object({ type: z.literal("session.restart") }),
  z.object({ type: z.literal("session.stop") }),
  z.object({ type: z.literal("popup.switch"), pageId: z.string() }),
  z.object({ type: z.literal("browser.navigate"), url: z.string().trim().min(1).max(2_048) }),
  z.object({ type: z.literal("browser.back") }),
  z.object({ type: z.literal("browser.forward") }),
  z.object({ type: z.literal("browser.reload") }),
  z.object({ type: z.literal("date.picker.select"), requestId: DatePickerRequestIdSchema, value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ type: z.literal("date.picker.dismiss"), requestId: DatePickerRequestIdSchema }),
  z.object({ type: z.literal("replay.start"), workflow: WorkflowSchema, startStepId: z.string().optional() }),
  z.object({ type: z.literal("replay.pause") }),
  z.object({ type: z.literal("replay.resume") }),
  z.object({ type: z.literal("replay.retry") }),
  z.object({ type: z.literal("replay.skip") }),
  z.object({ type: z.literal("replay.takeControl") }),
  z.object({ type: z.literal("replay.stop") }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ReplayStatusSchema = z.enum([
  "idle",
  "preparing",
  "running",
  "pausing",
  "paused",
  "manual",
  "completed",
  "stopping",
  "stopped",
]);

export const ReplayStepStatusSchema = z.enum(["pending", "running", "passed", "failed", "skipped"]);

const ReplayDiagnosticSchema = z.object({
  message: z.string(),
  attemptedLocators: z.array(z.object({ kind: z.string(), reason: z.string() })),
});

export const SequencedServerMessageSchema = z.object({
  sequence: z.number().int().nonnegative(),
  message: z.discriminatedUnion("type", [
    z.object({ type: z.literal("server.ready"), configured: z.boolean() }),
    z.object({
      type: z.literal("session.started"),
      sessionId: z.string(),
      liveViewUrl: z.string(),
      pageId: z.string(),
    }),
    z.object({ type: z.literal("session.status"), status: z.enum(["starting", "recording", "stopping", "stopped", "reconnecting"]) }),
    z.object({ type: z.literal("recorded.action"), action: RecordedActionSchema }),
    z.object({ type: z.literal("popup.detected"), pageId: z.string(), title: z.string(), url: z.string() }),
    z.object({ type: z.literal("popup.switched"), pageId: z.string(), liveViewUrl: z.string() }),
    z.object({ type: z.literal("browser.page"), pageId: z.string(), title: z.string(), url: z.string() }),
    z.object({ type: z.literal("browser.navigation.error"), message: z.string() }),
    z.object({
      type: z.literal("date.picker.open"),
      requestId: DatePickerRequestIdSchema,
      value: z.string(),
      min: z.string(),
      max: z.string(),
      rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
      viewport: z.object({ width: z.number().positive(), height: z.number().positive() }),
    }),
    z.object({ type: z.literal("date.picker.closed"), requestId: DatePickerRequestIdSchema }),
    z.object({
      type: z.literal("replay.started"),
      runId: z.string().uuid(),
      sessionId: z.string(),
      liveViewUrl: z.string(),
      pageId: z.string(),
      totalSteps: z.number().int().nonnegative(),
    }),
    z.object({
      type: z.literal("replay.status"),
      runId: z.string().uuid(),
      status: ReplayStatusSchema,
      currentStepId: z.string().optional(),
      currentIndex: z.number().int().nonnegative().optional(),
      totalSteps: z.number().int().nonnegative(),
    }),
    z.object({
      type: z.literal("replay.step"),
      runId: z.string().uuid(),
      stepId: z.string(),
      status: ReplayStepStatusSchema,
      durationMs: z.number().nonnegative().optional(),
      locatorKind: z.string().optional(),
      diagnostic: ReplayDiagnosticSchema.optional(),
    }),
    z.object({ type: z.literal("buffer.gap"), earliestSequence: z.number().int() }),
    z.object({
      type: z.literal("server.error"),
      code: z.string(),
      message: z.string(),
      recoverable: z.boolean(),
    }),
  ]),
});

export type SequencedServerMessage = z.infer<typeof SequencedServerMessageSchema>;
export type ServerMessage = SequencedServerMessage["message"];
export type ReplayStatus = z.infer<typeof ReplayStatusSchema>;
export type ReplayStepStatus = z.infer<typeof ReplayStepStatusSchema>;
export type ReplayDiagnostic = z.infer<typeof ReplayDiagnosticSchema>;
