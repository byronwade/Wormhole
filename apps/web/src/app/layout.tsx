import type { Metadata } from "next";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-[#030014] text-white`}>
        {children}
      </body>
    </html>
  );
}
