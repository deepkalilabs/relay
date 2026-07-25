import type { Metadata } from "next";
import { LibraryScreen, mockRecordings } from "@/features/library";

export const metadata: Metadata = {
  title: "Library | Browser Memory Recorder",
  description: "Browse mock browser recordings and inspect their recorded steps.",
};

export default function LibraryPage() {
  return <LibraryScreen recordings={mockRecordings} />;
}
