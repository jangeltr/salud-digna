import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  pageExtensions: process.env.NODE_ENV === "development" ? ["tsx", "dev.tsx"] : ["tsx"],
};

export default config;
