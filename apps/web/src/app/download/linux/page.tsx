import type { Metadata } from "next";
import { DownloadPlatformPage } from "@/components/download-platform-page";

export const metadata: Metadata = {
  title: "Download for Linux — Mount remote folders",
  description:
    "Install Wormhole on Linux. CLI-friendly P2P folder mounts for developers and pipelines. Requires FUSE 3.",
  alternates: { canonical: "/download/linux" },
};

export default function LinuxDownloadPage() {
  return <DownloadPlatformPage platform="linux" />;
}
