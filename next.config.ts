import type { NextConfig } from "next";
import { resolve } from "path";
import { readFileSync } from "fs";

// Manually parse .env.local since shell env vars override Next.js .env loading
function loadProjectEnv(): Record<string, string> {
  try {
    const envPath = resolve(import.meta.dirname, ".env.local");
    const content = readFileSync(envPath, "utf-8");
    const vars: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
    return vars;
  } catch {
    return {};
  }
}

const projectEnv = loadProjectEnv();

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve(import.meta.dirname),
  },
  env: {
    ANTHROPIC_API_KEY: projectEnv.ANTHROPIC_API_KEY || "",
    ANTHROPIC_BASE_URL: projectEnv.ANTHROPIC_BASE_URL || "",
  },
};

export default nextConfig;
