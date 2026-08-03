import type { Metadata } from "next";
import { DownloadPlatformPage } from "@/components/download-platform-page";

export const metadata: Metadata = {
  title: "Download for Linux",
  description: "Install Wormhole on Linux. Requires FUSE 3 for folder mounts.",
  alternates: { canonical: "/download/linux" },
};

export default function LinuxDownloadPage() {
  return <DownloadPlatformPage platform="linux" />;
}
