import type { Metadata } from "next";
import { DownloadPlatformPage } from "@/components/download-platform-page";

export const metadata: Metadata = {
  title: "Download for Windows",
  description: "Install Wormhole on Windows. Requires WinFSP for folder mounts.",
  alternates: { canonical: "/download/windows" },
};

export default function WindowsDownloadPage() {
  return <DownloadPlatformPage platform="windows" />;
}
