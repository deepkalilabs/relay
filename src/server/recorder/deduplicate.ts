import type { RecordedAction } from "@/lib/workflow/recorded-action";

export function actionFingerprint(action: RecordedAction): string {
  return [
    action.page.id,
    action.type,
    action.type === "navigate" ? String(action.payload?.url) : action.target?.candidates[0]?.value ?? "",
    action.type === "fill" ? String(action.payload?.value) : "",
  ].join(":");
}

export class ActionDeduplicator {
  private lastFingerprint = "";
  private lastAt = 0;

  shouldForward(action: RecordedAction, now = Date.now()): boolean {
    const fingerprint = actionFingerprint(action);
    if (fingerprint === this.lastFingerprint && now - this.lastAt < 500) return false;
    this.lastFingerprint = fingerprint;
    this.lastAt = now;
    return true;
  }
}
