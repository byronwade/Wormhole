import type { Metadata } from "next";
import { DownloadPlatformPage } from "@/components/download-platform-page";

export const metadata: Metadata = {
  title: "Download for Windows — Mount remote folders",
  description:
    "Install Wormhole on Windows. Mount remote project folders over P2P for editors and game teams. Requires WinFSP.",
  alternates: { canonical: "/download/windows" },
};

export default function WindowsDownloadPage() {
  return <DownloadPlatformPage platform="windows" />;
}
