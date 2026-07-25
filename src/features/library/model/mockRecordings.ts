export type RecordingPreview = "checkout" | "support" | "analytics" | "invite" | "billing" | "release";

export interface LibraryStep {
  id: string;
  label: string;
}

export interface LibraryRecording {
  id: string;
  title: string;
  stepCount: number;
  updatedLabel: string;
  preview: RecordingPreview;
  steps: readonly LibraryStep[];
}

function recording(
  id: string,
  title: string,
  stepCount: number,
  updatedLabel: string,
  preview: RecordingPreview,
  stepLabels: readonly string[],
): LibraryRecording {
  return {
    id,
    title,
    stepCount,
    updatedLabel,
    preview,
    steps: stepLabels.map((label, index) => ({ id: `${id}-${index + 1}`, label })),
  };
}

export const mockRecordings: readonly LibraryRecording[] = [
  recording("checkout-flow", "Checkout flow", 12, "Updated 2 hours ago", "checkout", [
    "Open checkout",
    "Enter contact information",
    "Continue to shipping",
    "Review order",
  ]),
  recording("support-ticket", "Create support ticket", 8, "Updated yesterday", "support", [
    "Open the support portal",
    "Choose a request type",
    "Describe the issue",
    "Submit the ticket",
  ]),
  recording("analytics-export", "Weekly analytics export", 15, "Updated 2 days ago", "analytics", [
    "Open analytics",
    "Set the weekly date range",
    "Choose CSV format",
    "Download the report",
  ]),
  recording("invite-teammate", "Invite a teammate", 6, "Updated 3 days ago", "invite", [
    "Open team settings",
    "Enter teammate details",
    "Choose a role",
    "Send the invitation",
  ]),
  recording("billing-address", "Update billing address", 7, "Updated 5 days ago", "billing", [
    "Open billing settings",
    "Edit the billing address",
    "Review tax information",
    "Save the address",
  ]),
  recording("release-notes", "Publish release notes", 9, "Updated 1 week ago", "release", [
    "Open the release draft",
    "Review the change summary",
    "Choose an audience",
    "Publish the release notes",
  ]),
];
