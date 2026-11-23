import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function config(phase: string): NextConfig {
  return {
    agentRules: false,
    pageExtensions: phase === PHASE_DEVELOPMENT_SERVER ? ["dev.tsx", "tsx"] : ["tsx"],
  };
}
