import { describe, expect, it } from "vitest";
import type { RecordedAction } from "@/lib/workflow/recorded-action";
import { ActionDeduplicator, actionFingerprint } from "@/server/recorder/deduplicate";
import { RECORDER_SCRIPT } from "@/server/recorder/injected";
import { isAutomaticallyRecordableAction } from "@/server/recorder/runtime";

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

  it("captures completed fields and semantic buttons only", () => {
    expect(RECORDER_SCRIPT).toContain("const dirtyFields = new Set()");
    expect(RECORDER_SCRIPT).toContain('document.addEventListener("focusout"');
    expect(RECORDER_SCRIPT).toContain("input[type='submit']");
    expect(RECORDER_SCRIPT).toContain('kind: "testId"');
    expect(RECORDER_SCRIPT).not.toContain('document.addEventListener("keydown"');
    expect(RECORDER_SCRIPT).not.toContain('document.addEventListener("submit"');
    expect(RECORDER_SCRIPT).not.toContain('"pushState", "replaceState"');
  });

  it("allows only fill and click actions through the automatic recorder", () => {
    const withType = (type: RecordedAction["type"]): RecordedAction => ({ ...action, type });
    expect(isAutomaticallyRecordableAction(withType("fill"))).toBe(true);
    expect(isAutomaticallyRecordableAction(withType("click"))).toBe(true);
    for (const type of ["navigate", "select", "check", "uncheck", "keypress", "submit"] as const) {
      expect(isAutomaticallyRecordableAction(withType(type))).toBe(false);
    }
  });
});
