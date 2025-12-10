import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wormhole - Mount Any Folder. Any Computer. No Setup.",
  description: "Share files instantly with anyone. No cloud uploads, no waiting. Just share a code and connect. P2P file sharing that feels like magic.",
  keywords: ["file sharing", "P2P", "peer to peer", "mount folder", "network drive", "file transfer"],
  authors: [{ name: "Wormhole Team" }],
  openGraph: {
    title: "Wormhole - Mount Any Folder. Any Computer. No Setup.",
    description: "Share files instantly with anyone. No cloud uploads, no waiting.",
    type: "website",
  },
};

// AGENTS.md: Mobile input font-size ≥16px or set viewport
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // AGENTS.md: NEVER disable browser zoom
  viewportFit: "cover",
  themeColor: "#0d0d0d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-wormhole-off-black text-wormhole-off-white`}>
        {/* AGENTS.md: Include a "Skip to content" link */}
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        <main id="main-content">
          {children}
        </main>
      </body>
    </html>
  );
}
