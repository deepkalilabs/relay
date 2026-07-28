import type { Metadata } from "next";
import { ProfileScreen } from "@/features/profile";

export const metadata: Metadata = {
  title: "Profiles | Browser Memory Recorder",
  description: "Review reusable identity, location, and browser parameters.",
};

export default function ProfilePage() {
  return <ProfileScreen />;
}
