import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // let a phone on the same Wi-Fi load the dev server (otherwise Next blocks its scripts)
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // the bear model and the pictures rarely change: let phones keep them a week
        source: "/:dir(models|baked|assets)/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
