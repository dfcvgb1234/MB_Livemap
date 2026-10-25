import type { NextConfig } from "next";

const exporting = process.env.MB_LIVEMAP_EXPORT === "1";

const nextConfig: NextConfig = {
  // The release build is a folder of HTML files the bridge serves itself.
  // In dev, the dashboard owns 43127, so /mcp has to be forwarded to the bridge
  // or an agent receives this site's HTML page.
  ...(exporting
    ? { output: "export" as const, trailingSlash: true }
    : {
        async rewrites() {
          const port = process.env.MB_LIVEMAP_HTTP_PORT ?? "18767";
          return [
            { source: "/mcp", destination: `http://127.0.0.1:${port}/mcp` },
            { source: "/mcp/", destination: `http://127.0.0.1:${port}/mcp` },
          ];
        },
      }),
  // The dev server is started on 0.0.0.0. A tablet on the same network requests
  // the page from this PC's LAN address, which Next would otherwise block.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "172.*.*.*"],
  experimental: {
    agentUpgrade: "security",
  },
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
