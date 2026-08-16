import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Project Vault",
    short_name: "Vault",
    description: "A D&D campaign notes workspace — browse, read, and edit your campaign from any device.",
    // Skips straight to the workspace for an already-signed-in installed
    // PWA — "/" is now the public landing page (still fine to land on if
    // the session has expired: (app)/layout.tsx's own gate redirects to
    // /sign-in from there).
    start_url: "/vault",
    display: "standalone",
    background_color: "#1e1e1e",
    theme_color: "#1e1e1e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
