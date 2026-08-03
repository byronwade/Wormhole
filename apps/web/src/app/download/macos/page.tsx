import type { Metadata } from "next";
import { DownloadPlatformPage } from "@/components/download-platform-page";

export const metadata: Metadata = {
  title: "Download for macOS — Mount remote folders",
  description:
    "Install Wormhole on macOS. Mount remote renders, builds, and project folders over P2P. Requires macFUSE.",
  alternates: { canonical: "/download/macos" },
};

export default function MacOSDownloadPage() {
  return <DownloadPlatformPage platform="macos" />;
}
