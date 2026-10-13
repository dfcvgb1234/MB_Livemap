import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
