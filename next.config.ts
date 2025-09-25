// next.config.ts
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // mysql2 gibi yalnızca Node runtime'da kalması gereken paketler:
  serverExternalPackages: ["mysql2"],

  // Proje kökünü açıkça belirt; lockfile uyarısını susturur.
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
