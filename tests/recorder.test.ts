import { describe, expect, it } from "vitest";
import type { RecordedAction } from "@/lib/workflow/recorded-action";
import { ActionDeduplicator, actionFingerprint } from "@/server/recorder/deduplicate";
import { RECORDER_SCRIPT } from "@/server/recorder/injected";

const action: RecordedAction = {
  type: "navigate", name: "Navigate", payload: { url: "https://example.com" }, sensitive: false,
  page: { id: "page", url: "https://example.com" }, recordedAt: new Date().toISOString(),
};

describe("recorder normalization", () => {
  it("deduplicates identical actions inside the 500ms window", () => {
    const deduplicator = new ActionDeduplicator();
    expect(deduplicator.shouldForward(action, 1_000)).toBe(true);
    expect(deduplicator.shouldForward(action, 1_200)).toBe(false);
    expect(deduplicator.shouldForward(action, 1_501)).toBe(true);
  });

  it("changes the fill fingerprint when the value changes", () => {
    const fill = { ...action, type: "fill" as const, payload: { value: "one" }, target: { candidates: [{ kind: "css" as const, value: "#email", exact: true }] } };
    expect(actionFingerprint(fill)).not.toBe(actionFingerprint({ ...fill, payload: { value: "two" } }));
  });

  it("installs debounce, navigation, form, and locator capture", () => {
    expect(RECORDER_SCRIPT).toContain("setTimeout(() => flushInput(element), 400)");
    expect(RECORDER_SCRIPT).toContain('"pushState", "replaceState"');
    expect(RECORDER_SCRIPT).toContain('kind: "testId"');
    expect(RECORDER_SCRIPT).toContain('type: "submit"');
  });
});
