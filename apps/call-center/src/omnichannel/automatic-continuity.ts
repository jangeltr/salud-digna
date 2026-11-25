import { open } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { isId, readRedemption, record } from "./contract";

export const automaticContinuityActions = ["verify-patient", "active-journeys", "authorize-journey"];
export const centralOrigin = "https://api.salud-digna.app";
const channel = "demo-callcenter";
const audience = "https://orchestrator.salud-digna.app";
const activeStatuses = ["DRAFT", "IN_PROGRESS", "PENDING_CONFIRMATION"];
const compact = /^[\w-]+\.[\w-]+\.[\w-]+$/;

export type ActiveJourney = { id: string; type: string; status: string; createdAt: string; updatedAt: string };
export type InstitutionalAccess = { assertion: string; expiresAt: number; allowed: Set<string> };

export function institutionalConfiguration() {
  const directory = process.env.CALL_CENTER_PATIENT_CONSENT_DIR;
  const channelKey = process.env.CALL_CENTER_PATIENT_ASSERTION_CHANNEL_KEY;
  return directory && isAbsolute(directory) && channelKey && /^[\w-]{43}$/.test(channelKey) &&
    Buffer.from(channelKey, "base64url").toString("base64url") === channelKey
    ? { directory, channelKey } : undefined;
}

export async function readAdvisorConsent(directory: string, advisorId: string) {
  if (!isId(advisorId)) throw new Error("Invalid advisor");
  const file = await open(join(directory, advisorId.toLowerCase() + ".jws"), "r").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!file) return null;
  try {
    if (!(await file.stat()).isFile()) return null;
    const buffer = Buffer.alloc(2052);
    const { bytesRead } = await file.read(buffer);
    if (bytesRead === buffer.length) return null;
    const consent = buffer.toString("utf8", 0, bytesRead).trim();
    return consent.length <= 2048 && compact.test(consent) ? consent : null;
  } finally {
    await file.close();
  }
}

export function readInstitutionalAssertion(value: unknown, advisorId: string, deadline: number): InstitutionalAccess {
  if (!record(value) || typeof value.assertion !== "string" || value.assertion.length > 2048 || !compact.test(value.assertion)) {
    throw new Error("Invalid assertion response");
  }
  const [header, payload, signature] = value.assertion.split(".");
  const metadata: unknown = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  // The configured HTTPS issuer supplied this response. The orchestrator verifies the signature.
  if (!record(metadata) || metadata.alg !== "EdDSA" || metadata.typ !== "sd-patient+jwt" ||
      Buffer.from(signature, "base64url").length !== 64 || !record(claims) ||
      claims.iss !== centralOrigin || claims.aud !== audience || claims.channel !== channel ||
      claims.scope !== "journeys:patient" || claims.sub !== advisorId || !isId(claims.customerId) ||
      typeof claims.exp !== "number" || typeof claims.iat !== "number" ||
      !Number.isSafeInteger(claims.exp) || !Number.isSafeInteger(claims.iat) ||
      claims.iat > now || claims.exp <= now || claims.exp - claims.iat > 300) {
    throw new Error("Invalid institutional claims");
  }
  const expiresAt = Math.min(deadline, claims.exp * 1000);
  if (expiresAt <= Date.now()) throw new Error("Expired institutional access");
  return { assertion: value.assertion, expiresAt, allowed: new Set() };
}

function isUtc(value: unknown): value is string {
  return typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value));
}

export function readActiveJourneys(value: unknown): ActiveJourney[] {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 100) throw new Error("Invalid active journeys");
  const seen = new Set<string>();
  return value.items.map((item: unknown) => {
    if (!record(item) || !isId(item.id) || typeof item.type !== "string" ||
        typeof item.status !== "string" || !activeStatuses.includes(item.status) ||
        !isUtc(item.createdAt) || !isUtc(item.updatedAt)) throw new Error("Invalid active journey");
    const id = item.id.toLowerCase();
    if (seen.has(id)) throw new Error("Duplicate journey");
    seen.add(id);
    return { id, type: item.type, status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt };
  });
}

export function readInstitutionalGrant(value: unknown, id: string, expiresAt: number) {
  const result = readRedemption(value);
  if (result.id !== id || result.expiresAt > expiresAt || result.expiresAt <= Date.now()) {
    throw new Error("Invalid institutional grant");
  }
  return result;
}
