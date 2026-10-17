import type { NextConfig } from "next";

const exporting = process.env.MB_LIVEMAP_EXPORT === "1";

const nextConfig: NextConfig = {
  // The release build is a folder of HTML files the bridge serves itself.
  ...(exporting ? { output: "export" as const, trailingSlash: true } : {}),
  // The dev server is started on 0.0.0.0. A tablet on the same network requests
  // the page from this PC's LAN address, which Next would otherwise block.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // Realtime tablet app — avoid Cache Components prerender constraints (Date/WS).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
