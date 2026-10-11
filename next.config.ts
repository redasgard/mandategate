import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
