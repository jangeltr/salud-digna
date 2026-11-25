import {
  BadGatewayException, BadRequestException, ConflictException, GatewayTimeoutException, HttpException,
  Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import type { AccountDto } from '../auth/auth.dto';
import { PatientAssertionsService } from '../auth/patient-assertions.service';
import { UserRole } from '../generated/prisma/enums';
import type { MobileHistoryQueryDto, PublishMobileEventDto } from './mobile-journeys.dto';
import { contextView, createdView, historyView, listView, record, summaryView, uuid } from './mobile-journeys.view';

const mobileChannel = { code: 'demo-mobile', role: UserRole.PATIENT } as const;
const timeoutMs = 5_000;

export interface MobileSession { user: AccountDto; expiresAt: number }

function isOpaqueToken(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[\w-]{43}$/.test(value)) return false;
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length === 32 && bytes.toString('base64url') === value;
}

function connection() {
  const origin = URL.parse(process.env.MOBILE_ORCHESTRATOR_ORIGIN ?? '');
  const key = process.env.MOBILE_ORCHESTRATOR_API_KEY;
  const parts = key?.split('.');
  if (!origin || origin.username || origin.password || origin.href !== origin.origin + '/' ||
      (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && process.env.NODE_ENV !== 'production' &&
        ['127.0.0.1', 'localhost'].includes(origin.hostname))) ||
      !parts || parts.length !== 2 || !isUUID(parts[0]) || !isOpaqueToken(parts[1])) {
    throw new ServiceUnavailableException();
  }
  return { origin, key };
}

function scopeKey(owner: string, value: string): string {
  return createHash('sha256').update(JSON.stringify([owner, value])).digest('base64url');
}

function upstreamError(status: number): Error {
  if (status === 400) return new BadRequestException();
  if (status === 404) return new NotFoundException();
  if (status === 409) return new ConflictException();
  if (status === 429) return new HttpException('Too Many Requests', 429);
  if (status === 503 || status === 401 || status === 403) return new ServiceUnavailableException();
  return new BadGatewayException();
}

@Injectable()
export class MobileJourneysService {
  constructor(private readonly assertions: PatientAssertionsService) {}

  async list(session: MobileSession) {
    const { assertion } = await this.assertions.issue(session.user, mobileChannel, session.expiresAt);
    return listView(await this.call('journeys?active=true', 200, { 'X-Patient-Assertion': assertion }));
  }

  async create(session: MobileSession, key: unknown, input: { type: 'APPOINTMENT' }) {
    if (!isOpaqueToken(key)) throw new BadRequestException();
    const { assertion } = await this.assertions.issue(session.user, mobileChannel, session.expiresAt);
    return createdView(await this.call('journeys', 201, {
      'X-Patient-Assertion': assertion, 'Idempotency-Key': scopeKey(session.user.id, key),
    }, 'POST', { type: input.type }));
  }

  async summary(session: MobileSession, journeyId: string) {
    return summaryView(await this.read(session, journeyId, ''), journeyId);
  }

  async context(session: MobileSession, journeyId: string) {
    return contextView(await this.read(session, journeyId, '/context'), journeyId);
  }

  async history(session: MobileSession, journeyId: string, query: MobileHistoryQueryDto) {
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.cursor !== undefined) params.set('cursor', query.cursor);
    return historyView(await this.read(session, journeyId, '/history?' + params.toString()), query.limit ?? 20);
  }

  async publish(session: MobileSession, journeyId: string, event: PublishMobileEventDto) {
    const { expectedVersion, studyId, clinicId, to } = event.payload;
    const isContext = event.type === 'JOURNEY_CONTEXT_UPDATED';
    if (isContext ? to !== undefined || (!studyId && !clinicId) : !to || studyId !== undefined || clinicId !== undefined) {
      throw new BadRequestException();
    }
    const grant = await this.grant(session, journeyId);
    const result = record(await this.call('events', 201, { 'X-Journey-Grant': grant }, 'POST', {
      journeyId, externalEventId: `mobile:${scopeKey(journeyId, event.externalEventId)}`,
      type: event.type, schemaVersion: event.schemaVersion, occurredAt: event.occurredAt,
      payload: isContext ? { expectedVersion, studyId, clinicId } : { expectedVersion, to },
    }));
    if (uuid(result.journeyId) !== journeyId) throw new BadGatewayException();
    return { id: uuid(result.id), journeyId };
  }

  private async read(session: MobileSession, journeyId: string, suffix: string) {
    const grant = await this.grant(session, journeyId);
    return this.call(`journeys/${journeyId}${suffix}`, 200, { 'X-Journey-Grant': grant });
  }

  private async grant(session: MobileSession, journeyId: string) {
    const { assertion } = await this.assertions.issue(session.user, mobileChannel, session.expiresAt);
    const result = record(await this.call(`journeys/${journeyId}/access-grants`, 201, { 'X-Patient-Assertion': assertion }, 'POST'));
    if (uuid(result.journeyId) !== journeyId || !isOpaqueToken(result.grant)) throw new BadGatewayException();
    return result.grant;
  }

  private async call(path: string, expected: number, headers: Record<string, string>, method = 'GET', body?: object): Promise<unknown> {
    const { origin, key } = connection();
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetch(new URL(`/api/v1/${path}`, origin), {
        method, signal, redirect: 'error', cache: 'no-store',
        headers: { Authorization: `Bearer ${key}`, ...headers, ...(body && { 'Content-Type': 'application/json' }) },
        body: body && JSON.stringify(body),
      });
    } catch {
      throw signal.aborted ? new GatewayTimeoutException() : new BadGatewayException();
    }
    if (response.status !== expected) {
      await response.body?.cancel().catch(() => undefined);
      throw upstreamError(response.status);
    }
    try {
      return await response.json();
    } catch {
      throw signal.aborted ? new GatewayTimeoutException() : new BadGatewayException();
    }
  }
}
