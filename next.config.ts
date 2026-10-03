import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";

// Build workers and the production server must reuse one release value.
const releaseFile = new URL("./.app-runtime/release.json", import.meta.url);
const release = existsSync(releaseFile) ? JSON.parse(readFileSync(releaseFile, "utf8")).version : "development";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_RELEASE: release },
  async headers() {
    return [
      { source: "/mirror/:path*", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
