import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@/features/recorder/recorder.css";
import "@/features/browser/browser.css";
import "@/features/workflow/workflow.css";
import "@/components/ui/modal.css";

export const metadata: Metadata = {
  title: "Browser Memory Recorder",
  description: "Turn browser interactions into editable semantic workflows.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
