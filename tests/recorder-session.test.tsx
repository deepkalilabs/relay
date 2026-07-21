import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@/lib/protocol";
import { useRecorderSession } from "@/features/recorder/useRecorderSession";

const socket = vi.hoisted(() => ({
  onMessage: null as ((message: ServerMessage) => void) | null,
  send: vi.fn(() => true),
}));

vi.mock("@/hooks/use-recorder-socket", () => ({
  useRecorderSocket: (onMessage: (message: ServerMessage) => void) => {
    socket.onMessage = onMessage;
    return { transportStatus: "connected" as const, send: socket.send };
  },
}));

describe("useRecorderSession", () => {
  beforeEach(() => {
    socket.onMessage = null;
    socket.send.mockClear();
  });

  it("forwards session identity and normalized recorded steps to the workspace", () => {
    const onSessionStarted = vi.fn();
    const onStepRecorded = vi.fn();
    renderHook(() => useRecorderSession({ onSessionStarted, onStepRecorded }));

    act(() => socket.onMessage?.({
      type: "session.started",
      sessionId: "session-1",
      liveViewUrl: "https://example.com/live",
      pageId: "page-1",
    }));
    act(() => socket.onMessage?.({
      type: "recorded.action",
      action: {
        type: "click",
        name: "Click Continue",
        sensitive: false,
        target: { candidates: [{ kind: "role", value: "button", name: "Continue", exact: true }] },
        page: { id: "page-1", url: "https://example.com" },
        recordedAt: new Date().toISOString(),
      },
    }));

    expect(onSessionStarted).toHaveBeenCalledWith("session-1");
    expect(onStepRecorded).toHaveBeenCalledWith(expect.objectContaining({
      type: "click",
      name: "Click Continue",
      order: 0,
    }));
  });
});
