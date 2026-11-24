import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { JourneyGrantOperation } from '../generated/prisma/enums';
import { PrismaService } from '../persistence/prisma.service';

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const codePattern = new RegExp(`^(?:[${alphabet}]{12}|[${alphabet}]{4}(?:-[${alphabet}]{4}){2})$`, 'i');
const operations = [JourneyGrantOperation.READ_JOURNEY, JourneyGrantOperation.PUBLISH_EVENT];
const ttlMs = 5 * 60_000;

function codeDigest(code: string): Uint8Array<ArrayBuffer> {
  const encodedKey = process.env.ORCHESTRATOR_CONTINUITY_HMAC_KEY;
  if (!encodedKey || encodedKey.length !== 43) throw new ServiceUnavailableException();
  const key = Buffer.from(encodedKey, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== encodedKey) throw new ServiceUnavailableException();
  return Uint8Array.from(createHmac('sha256', key).update(code).digest());
}

function activeSource(now: Date) {
  return { revokedAt: null, expiresAt: { gt: now }, operations: { hasEvery: operations }, channel: { isActive: true } };
}

@Injectable()
export class ContinuityCodesService {
  private readonly attempts = new Map<string, { resetsAt: number; count: number }>();

  constructor(private readonly prisma: PrismaService) {}

  issue(channelId: string, journeyId: string, grantId: string) {
    const code = Array.from(randomBytes(12), (byte) => alphabet[byte & 31]).join('');
    const digest = codeDigest(code);
    return this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      const source = await tx.journeyAccessGrant.findUnique({
        where: { id: grantId, channelId, journeyId, ...activeSource(now) },
        select: { actorRef: true, expiresAt: true },
      });
      if (!source) throw new NotFoundException();
      const expiresAt = new Date(Math.min(now.getTime() + ttlMs, source.expiresAt.getTime()));
      await tx.continuityCode.create({
        data: { digest, sourceGrantId: grantId, createdAt: now, expiresAt },
        select: { id: true },
      });
      await tx.accessAudit.create({
        data: { journeyId, channelId, actorRef: source.actorRef, action: 'ISSUE_CONTINUITY_CODE', outcome: 'ALLOWED' },
        select: { id: true },
      });
      return { code: `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`, expiresAt };
    });
  }

  redeem(channelId: string, body: unknown) {
    this.countAttempt(channelId);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 ||
        !Object.hasOwn(body, 'code')) throw new BadRequestException();
    const { code } = body as { code: unknown };
    if (typeof code !== 'string' || (code.length !== 12 && code.length !== 14) || !codePattern.test(code)) {
      throw new BadRequestException();
    }
    const digest = codeDigest(code.replaceAll('-', '').toUpperCase());
    return this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      const [claimed] = await tx.continuityCode.updateManyAndReturn({
        where: {
          digest, consumedAt: null, expiresAt: { gt: now },
          sourceGrant: { ...activeSource(now), channelId: { not: channelId } },
        },
        data: { consumedAt: now },
        select: { id: true, sourceGrant: { select: { journeyId: true } } },
      });
      if (!claimed) throw new NotFoundException();

      const { journeyId } = claimed.sourceGrant;
      const actorRef = `continuity:${claimed.id}`;
      const secret = randomBytes(32);
      const expiresAt = new Date(now.getTime() + ttlMs);
      await tx.journeyAccessGrant.create({
        data: {
          channelId, journeyId, actorRef, operations, createdAt: now, expiresAt,
          digest: Uint8Array.from(createHash('sha256').update(secret).digest()),
        },
        select: { id: true },
      });
      await tx.accessAudit.create({
        data: { journeyId, channelId, actorRef, action: 'REDEEM_CONTINUITY_CODE', outcome: 'ALLOWED' },
        select: { id: true },
      });
      return { journeyId, grant: secret.toString('base64url'), grantExpiresAt: expiresAt };
    });
  }

  private countAttempt(channelId: string): void {
    const now = Date.now();
    let window = this.attempts.get(channelId);
    if (!window || window.resetsAt <= now) {
      window = { resetsAt: now + 60_000, count: 0 };
      this.attempts.set(channelId, window);
    }
    if (window.count >= 10) throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    window.count++;
  }
}
