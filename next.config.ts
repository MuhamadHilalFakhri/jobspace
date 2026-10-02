import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { loadEnvConfig } from "@next/env";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "bcryptjs"],
};

if (process.env.NODE_ENV === "development") {
  loadEnvConfig(process.cwd());
  process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??=
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";
  initOpenNextCloudflareForDev();
}

export default nextConfig;
