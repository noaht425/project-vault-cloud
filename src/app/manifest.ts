import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Project Vault",
    short_name: "Vault",
    description: "A D&D campaign notes workspace — browse, read, and edit your campaign from any device.",
    start_url: "/",
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
