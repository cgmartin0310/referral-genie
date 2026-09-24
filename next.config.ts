import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo is the project root, even when a stray lockfile sits in a parent folder.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
