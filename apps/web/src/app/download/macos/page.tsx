import type { Metadata } from "next";
import { DownloadPlatformPage } from "@/components/download-platform-page";

export const metadata: Metadata = {
  title: "Download for macOS",
  description: "Install Wormhole on macOS. Requires macFUSE for folder mounts.",
  alternates: { canonical: "/download/macos" },
};

export default function MacOSDownloadPage() {
  return <DownloadPlatformPage platform="macos" />;
}
