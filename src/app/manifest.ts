import type { MetadataRoute } from "next";

/**
 * Lets the app be installed to a phone's home screen. It is mobile-first and
 * used standing in a kitchen, so running without browser chrome matters.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DivvyUp — Payment Planning for Roommates",
    short_name: "DivvyUp",
    description:
      "Split rent, utilities, and shared expenses with your roommates.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f5f7",
    theme_color: "#f5f5f7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
