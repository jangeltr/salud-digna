import { createHash, randomUUID } from "node:crypto";
import {
  automaticContinuityActions, centralOrigin, institutionalConfiguration, readActiveJourneys,
  readAdvisorConsent, readInstitutionalAssertion, readInstitutionalGrant, type InstitutionalAccess,
} from "./automatic-continuity";
import { allowsPending, continuityCode, eventPayload, hasPublishScope, readRedemption, isId, readContext, readHistory, readReceipt, readSummary, record, type Outcome } from "./contract";

class HttpFailure extends Error {
  constructor(readonly status: number) { super("Upstream request failed"); }
}

type Attempt = { operationId: string; body: string; result?: Outcome; uncertain?: boolean };
type Access = { id: string; grant: string; expiresAt: number; redeemed?: boolean; institutional?: boolean; attempt?: Attempt; timer: ReturnType<typeof setTimeout> };
const grants = new Map<string, Access>();
const attentions = new Map<string, InstitutionalAccess & { timer: ReturnType<typeof setTimeout> }>();
const running = new Map<string, AbortController>();
const maxSessions = 256;
const grantFormat = /^[A-Za-z0-9_-]{43}$/;
const operations = ["open", "read", "history", "close", "publish", "retry", "redeem", "resume", ...automaticContinuityActions];
const upstreamBase = "https://orchestrator.salud-digna.app/api/v1/";
const accessWindow = 300000;

function remove(key: string) {
  const entry = grants.get(key);
  if (entry) clearTimeout(entry.timer);
  grants.delete(key);
}

function revoke(key: string) {
  const attention = attentions.get(key);
  if (attention) clearTimeout(attention.timer);
  attentions.delete(key);
  running.get(key)?.abort();
  remove(key);
}

function sessionDeadline(authorization: string) {
  try {
    const claims: unknown = JSON.parse(Buffer.from(authorization.split(".")[1], "base64url").toString("utf8"));
    if (record(claims) && typeof claims.exp === "number" && Number.isSafeInteger(claims.exp)) return claims.exp * 1000;
  } catch { /* The authentication service must return a valid JWT session. */ }
  return 0;
}

function sameOrigin(request: Request, configured: string | undefined) {
  if (!configured && process.env.NODE_ENV !== "development") return false;
  const allowed = new URL(configured ?? request.url);
  const origin = request.headers.get("origin");
  return origin === allowed.origin && (allowed.protocol === "https:" ||
    (process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(allowed.hostname)));
}

async function json(url: URL, options: RequestInit, expected = 200, operation?: AbortSignal) {
  const response = await fetch(url, { ...options, redirect: "error", cache: "no-store", signal: operation ? AbortSignal.any([AbortSignal.timeout(10000), operation]) : AbortSignal.timeout(10000) });
  if (!response.ok) throw new HttpFailure(response.status);
  if (response.status !== expected) throw new Error("Unexpected HTTP status");
  return await response.json() as unknown;
}

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function accessDenied(error: unknown) {
  return error instanceof HttpFailure && [401, 403, 404].includes(error.status);
}

async function input(request: Request) {
  const stream = request.body?.getReader();
  if (!stream) throw new HttpFailure(400);
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  for (;;) {
    const { value, done } = await stream.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { void stream.cancel().catch(() => {}); throw new HttpFailure(400); }
    body += decoder.decode(value, { stream: true });
  }
  try {
    const value: unknown = JSON.parse(body + decoder.decode());
    if (record(value) && typeof value.action === "string" && operations.includes(value.action)) return value;
  } catch { /* Return the same error for malformed and disallowed input. */ }
  throw new HttpFailure(400);
}

export function createOmnichannelHandler(role: "ADVISOR" | "ADMIN", keyName: string) {
  return async function POST(request: Request) {
    try {
      if (!sameOrigin(request, process.env.STAFF_FRONTEND_ORIGIN)) return reply({ error: "origin" }, 403);
      if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply({ error: "input" }, 400);
      const authorization = request.headers.get("authorization");
      if (!authorization || !/^Bearer [\w.-]{1,4096}$/.test(authorization)) return reply({ error: "session" }, 401);

      const instanceId = request.headers.get("x-staff-instance");
      if (!isId(instanceId)) return reply({ error: "session" }, 401);
      const sessionKey = createHash("sha256").update(authorization).update(":").update(instanceId).digest("hex");
      const body = await input(request);
      const action = body.action;
      const controller = action === "close" ? undefined : new AbortController();
      if (controller) {
        if (running.has(sessionKey)) return reply({ error: "busy" }, 409);
        if (running.size >= maxSessions) return reply({ error: "capacity" }, 503);
        running.set(sessionKey, controller);
      }
      try {
        const general = new URL(process.env.GENERAL_API_ORIGIN ?? "http://127.0.0.1:3000");
        const local = process.env.NODE_ENV !== "production" && general.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(general.hostname);
        if (general.protocol !== "https:" && !local) return reply({ error: "configuration" }, 503);
        let operator: unknown;
        try {
          operator = await json(new URL("/api/v1/auth/me", general), { headers: { Authorization: authorization } }, 200, controller?.signal);
        } catch (error) {
          if (accessDenied(error)) { revoke(sessionKey); return reply({ error: "session" }, 401); }
          return reply({ error: "session-unavailable" }, 503);
        }
        if (!record(operator) || operator.role !== role || operator.isActive !== true) {
          revoke(sessionKey);
          return reply({ error: "operator" }, 403);
        }
        // The general API has verified the bearer. Only use exp to narrow the local lifetime.
        const deadline = sessionDeadline(authorization);
        if (deadline <= Date.now()) { revoke(sessionKey); return reply({ error: "session" }, 401); }
        if (action === "close") { revoke(sessionKey); return reply({ closed: true }); }
        if (role === "ADMIN" && (["publish", "retry", "redeem", "resume"].includes(String(action)))) return reply({ error: "operator" }, 403);
        const apiKey = process.env[keyName];
        if (!apiKey) return reply({ error: "configuration" }, 503);
        controller!.signal.throwIfAborted();
        if (automaticContinuityActions.includes(String(action))) {
          if (role !== "ADVISOR" || !isId(operator.id)) return reply({ error: "operator" }, 403);
          if (general.origin !== centralOrigin) return reply({ error: "configuration" }, 503);
          return await institutional(sessionKey, operator.id, body, authorization, apiKey, deadline, controller!.signal);
        }
        if ((action === "open" || action === "redeem") && attentions.has(sessionKey)) {
          return reply({ error: "access-active" }, 409);
        }
        if (action === "redeem") return await redeem(sessionKey, body, apiKey, deadline, controller!.signal);
        if (action === "resume") {
          const entry = grants.get(sessionKey);
          return entry?.redeemed && entry.expiresAt > Date.now()
            ? reply({ journeyId: entry.id, expiresAt: entry.expiresAt })
            : reply({ error: "grant" }, 404);
        }
        if (!isId(body.journeyId)) return reply({ error: "input" }, 400);
        return await operate(sessionKey, body.journeyId.toLowerCase(), body, apiKey, deadline, controller!.signal);
      } finally {
        if (controller) running.delete(sessionKey);
      }
    } catch (error) {
      return reply({ error: "upstream" }, error instanceof HttpFailure &&
        [400, 401, 403, 404, 409, 429].includes(error.status) ? error.status : 503);
    }
  };
}

function saveAccess(key: string, id: string, grant: string, expiresAt: number, redeemed = false, institutional = false) {
  remove(key);
  const timer = setTimeout(() => revoke(key), expiresAt - Date.now());
  timer.unref();
  grants.set(key, { id, grant, expiresAt, redeemed, institutional, timer });
}

async function institutional(
  key: string, advisorId: string, body: Record<string, unknown>, authorization: string,
  apiKey: string, deadline: number, signal: AbortSignal,
) {
  const action = body.action;
  const granting = action === "authorize-journey";
  if (Object.keys(body).length !== (granting ? 2 : 1) || (granting && !isId(body.journeyId))) {
    return reply({ error: "input" }, 400);
  }
  if (action === "verify-patient") {
    const current = attentions.get(key);
    if (current && current.expiresAt > Date.now()) return reply({ expiresAt: current.expiresAt });
    if (grants.has(key)) return reply({ error: "access-active" }, 409);
    if (attentions.size + running.size > maxSessions) return reply({ error: "capacity" }, 503);
    const configuration = institutionalConfiguration();
    if (!configuration) return reply({ error: "institutional-configuration" }, 503);
    const consent = await readAdvisorConsent(configuration.directory, advisorId);
    if (!consent) return reply({ error: "consent-required" }, 404);
    const issued = await json(new URL("/api/v1/auth/patient-assertions", centralOrigin), {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json",
        "X-Patient-Assertion-Channel-Key": configuration.channelKey },
      body: JSON.stringify({ consent }),
    }, 200, signal);
    const attention = readInstitutionalAssertion(issued, advisorId, deadline);
    signal.throwIfAborted();
    if (current) clearTimeout(current.timer);
    const timer = setTimeout(() => revoke(key), attention.expiresAt - Date.now());
    timer.unref();
    attentions.set(key, { ...attention, timer });
    return reply({ expiresAt: attention.expiresAt });
  }

  const attention = attentions.get(key);
  if (!attention || attention.expiresAt <= Date.now()) {
    if (attention) revoke(key);
    return reply({ error: "institutional-expired" }, 404);
  }
  const headers = { Authorization: "Bearer " + apiKey, "X-Patient-Assertion": attention.assertion };
  if (action === "active-journeys") {
    try {
      const items = readActiveJourneys(await json(new URL("journeys?active=true", upstreamBase), { headers }, 200, signal));
      signal.throwIfAborted();
      if (Date.now() >= attention.expiresAt) return reply({ error: "institutional-expired" }, 404);
      attention.allowed = new Set(items.map((item) => item.id));
      return reply({ items });
    } catch (error) {
      attention.allowed.clear();
      if (accessDenied(error)) revoke(key);
      throw error;
    }
  }

  const id = String(body.journeyId).toLowerCase();
  if (!attention.allowed.has(id)) return reply({ error: "journey-not-authorized" }, 403);
  const current = grants.get(key);
  if (current?.attempt && !current.attempt.result) return reply({ error: "pending" }, 409);
  if (current && current.id === id && current.expiresAt > Date.now()) {
    return reply({ journeyId: id, expiresAt: current.expiresAt });
  }
  if (!current && grants.size + running.size > maxSessions) return reply({ error: "capacity" }, 503);
  try {
    const result = readInstitutionalGrant(
      await json(new URL("journeys/" + id + "/access-grants", upstreamBase), { method: "POST", headers }, 201, signal),
      id, attention.expiresAt,
    );
    signal.throwIfAborted();
    saveAccess(key, id, result.grant, result.expiresAt, false, true);
    return reply({ journeyId: id, expiresAt: result.expiresAt }, 201);
  } catch (error) {
    if (accessDenied(error)) revoke(key);
    throw error;
  }
}

async function redeem(key: string, body: Record<string, unknown>, apiKey: string, deadline: number, signal: AbortSignal) {
  const code = continuityCode(body.code);
  if (!code || Object.keys(body).length !== 2) return reply({ error: "input" }, 400);
  const active = grants.get(key);
  if (active && active.expiresAt > Date.now()) return reply({ error: "access-active" }, 409);
  if (!grants.has(key) && grants.size + running.size > maxSessions) return reply({ error: "capacity" }, 503);
  try {
    const result = readRedemption(await json(new URL("continuity-codes/redeem", upstreamBase), {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }, 201, signal));
    const expiresAt = Math.min(result.expiresAt, deadline, Date.now() + accessWindow);
    if (signal.aborted || expiresAt <= Date.now()) return reply({ error: "redemption-expired" }, 410);
    // Store first. The browser starts separate reads only after receiving this receipt.
    if (!grants.has(key) && grants.size >= maxSessions) return reply({ error: "redemption-uncertain" }, 503);
    saveAccess(key, result.id, result.grant, expiresAt, true);
    return reply({ journeyId: result.id, expiresAt }, 201);
  } catch (error) {
    if (error instanceof HttpFailure && [400, 401, 403, 404, 429].includes(error.status)) {
      return reply({ error: "redemption-rejected" }, error.status);
    }
    return reply({ error: "redemption-uncertain" }, 503);
  }
}

async function canPublish(apiKey: string, signal: AbortSignal) {
  try {
    return hasPublishScope(await json(new URL("channel-auth/verify", upstreamBase), {
      headers: { Authorization: "Bearer " + apiKey },
    }, 200, signal));
  } catch (error) {
    if (accessDenied(error)) throw error;
    return false;
  }
}

async function operate(key: string, id: string, body: Record<string, unknown>, apiKey: string, deadline: number, signal: AbortSignal) {
  const action = body.action;
  const entry = grants.get(key);
  const opening = action === "open";
  if (entry && entry.expiresAt <= Date.now()) remove(key);
  if (opening && entry && grants.has(key) && entry.attempt && !entry.attempt.result) {
    return reply({ error: "pending" }, 409);
  }
  if (opening && (typeof body.grant !== "string" || !grantFormat.test(body.grant))) return reply({ error: "input" }, 400);
  const grant = opening ? body.grant as string : grants.has(key) && entry?.id === id ? entry.grant : undefined;
  if (!grant) return reply({ error: "grant" }, 404);
  const expiresAt = opening ? Math.min(Date.now() + accessWindow, deadline) : entry!.expiresAt;
  const journey = "journeys/" + id;
  function upstream(path: string, payload?: string) {
    return json(new URL(path, upstreamBase), {
      method: payload === undefined ? "GET" : "POST",
      headers: { Authorization: "Bearer " + apiKey, "X-Journey-Grant": grant!,
        ...(payload === undefined ? {} : { "Content-Type": "application/json" }) },
      body: payload,
    }, payload === undefined ? 200 : 201, signal);
  }

  try {
    if (action === "history") {
      if (typeof body.cursor !== "string" || !body.cursor || body.cursor.length > 200) return reply({ error: "input" }, 400);
      const page = readHistory(await upstream(journey + "/history?" + new URLSearchParams({ limit: "20", cursor: body.cursor })));
      return !signal.aborted && Date.now() < expiresAt ? reply(page) : reply({ error: "grant" }, 404);
    }

    if (opening || action === "read") {
      if (opening && !grants.has(key) && grants.size >= maxSessions) return reply({ error: "capacity" }, 503);
      const [summary, context, history] = await Promise.allSettled([
        upstream(journey).then((value) => readSummary(value, id)),
        upstream(journey + "/context").then((value) => readContext(value, id)),
        upstream(journey + "/history?limit=20").then(readHistory),
      ]);
      for (const result of [summary, context, history]) {
        if (result.status === "rejected" && accessDenied(result.reason)) throw result.reason;
      }
      if (summary.status === "rejected") throw summary.reason;
      if (context.status === "rejected") throw context.reason;
      const needsScope = !opening && (entry?.institutional ||
        (entry?.redeemed && allowsPending(summary.value, context.value)));
      const publishScope = needsScope ? await canPublish(apiKey, signal) : false;
      const canWrite = entry?.institutional ? publishScope : true;
      const canMarkPending = publishScope && allowsPending(summary.value, context.value);
      if (signal.aborted || Date.now() >= expiresAt) return reply({ error: "grant" }, 404);
      if (opening) {
        if (!grants.has(key) && grants.size >= maxSessions) return reply({ error: "capacity" }, 503);
        saveAccess(key, id, grant, expiresAt);
      }
      return reply({ status: summary.value, context: context.value,
        history: history.status === "fulfilled" ? history.value : null, expiresAt, canMarkPending, canWrite });
    }

    if (!isId(body.operationId)) return reply({ error: "input" }, 400);
    if (action === "publish") {
      if (entry!.attempt && !entry!.attempt.result) return reply({ error: "pending" }, 409);
      const event = eventPayload(body);
      if (!event) return reply({ error: "input" }, 400);
      if (entry!.attempt?.operationId === body.operationId) return reply({ error: "pending" }, 409);
      if (event.type === "JOURNEY_STATUS_CHANGED" && body.to === "PENDING_CONFIRMATION") {
        try {
          if ((!entry!.redeemed && !entry!.institutional) || !await canPublish(apiKey, signal)) return reply({ outcome: "rejected", status: 403 });
          const [status, context] = await Promise.all([
            upstream(journey).then((value) => readSummary(value, id)),
            upstream(journey + "/context").then((value) => readContext(value, id)),
          ]);
          if (!allowsPending(status, context) || context.version !== event.payload.expectedVersion) {
            return reply({ outcome: "rejected", status: 409 });
          }
        } catch (error) {
          if (accessDenied(error)) throw error;
          // No event was sent. A failure here cannot leave a pending write.
          return reply({ outcome: "rejected", status: error instanceof HttpFailure && error.status === 429 ? 429 : 503 });
        }
        if (signal.aborted || Date.now() >= expiresAt) return reply({ error: "grant" }, 404);
      }
      entry!.attempt = { operationId: body.operationId, body: JSON.stringify({ journeyId: id, externalEventId: randomUUID(), schemaVersion: 1,
        occurredAt: new Date().toISOString(), ...event }) };
    }
    const attempt = entry!.attempt;
    if (!attempt || attempt.operationId !== body.operationId) return reply({ error: "attempt" }, 404);
    if (attempt.result) return reply(attempt.result);
    try {
      const eventId = readReceipt(await upstream("events", attempt.body), id);
      attempt.result = { outcome: "applied", eventId };
      return !signal.aborted && Date.now() < expiresAt ? reply(attempt.result) : reply({ outcome: "applied" });
    } catch (error) {
      const status = error instanceof HttpFailure ? error.status : undefined;
      if (accessDenied(error)) {
        if (entry?.institutional) revoke(key);
        else remove(key);
        return reply({ outcome: attempt.uncertain ? "uncertain" : "rejected", status });
      }
      if (status === 400 || status === 409) {
        attempt.result = { outcome: "rejected", status };
        return reply(attempt.result);
      }
      // Keep the exact bytes for explicit retry. A rate limit does not resolve an earlier uncertain send.
      if (status !== 429) attempt.uncertain = true;
      return reply({ outcome: "uncertain", status });
    }
  } catch (error) {
    if (accessDenied(error)) {
      if (entry?.institutional) revoke(key);
      else remove(key);
    }
    throw error;
  }
}
