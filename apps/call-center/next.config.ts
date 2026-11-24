import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  pageExtensions: process.env.NODE_ENV === "development" ? ["tsx", "ts", "dev.tsx"] : ["tsx", "ts"],
};

export default config;
