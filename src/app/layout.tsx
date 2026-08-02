import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Vault",
  description: "A D&D campaign notes workspace — browse, read, and edit your campaign from any device.",
  // iOS ignores the web manifest for standalone-mode chrome — these meta
  // tags are what actually gets Add-to-Home-Screen to open without Safari's
  // UI and use a dark status bar instead of the default light one.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Project Vault",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1e1e1e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
