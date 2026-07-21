import { z } from "zod";
import { RecordedActionSchema } from "@/lib/workflow/recorded-action";

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("client.hello"), clientId: z.string().uuid(), lastSequence: z.number().int().nonnegative() }),
  z.object({ type: z.literal("session.start") }),
  z.object({ type: z.literal("session.restart") }),
  z.object({ type: z.literal("session.stop") }),
  z.object({ type: z.literal("popup.switch"), pageId: z.string() }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

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
