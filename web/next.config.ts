import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is started on 0.0.0.0. An iPad on the same network requests
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
