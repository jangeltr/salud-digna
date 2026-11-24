import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import { RequireChannelScopes, type ChannelRequest } from '../channel-auth/channel-auth.guard';
import { ChannelScope, JourneyGrantOperation } from '../generated/prisma/enums';
import { PrismaService } from '../persistence/prisma.service';

export interface JourneyAccessRequest extends ChannelRequest {
  params?: { journeyId?: string };
  body?: unknown;
  journeyAccess?: {
    readonly journeyId: string;
    readonly actorRef: string;
    readonly operation: JourneyGrantOperation;
  };
}

const RequiredJourneyOperation = Reflector.createDecorator<{
  operation: JourneyGrantOperation;
  source: 'params' | 'body';
}>();
const channelScopeByOperation: Record<JourneyGrantOperation, ChannelScope> = {
  READ_JOURNEY: ChannelScope.JOURNEYS_READ,
  PUBLISH_EVENT: ChannelScope.EVENTS_PUBLISH,
};
const journeyIdPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

function readGrantDigest(request: JourneyAccessRequest): Buffer | undefined {
  const header = request.headers['x-journey-grant'];
  if (typeof header !== 'string' || !/^[\w-]{43}$/.test(header) ||
      (request.headersDistinct?.['x-journey-grant']?.length ?? 0) > 1) return undefined;

  const secret = Buffer.from(header, 'base64url');
  if (secret.length !== 32 || secret.toString('base64url') !== header) return undefined;

  return createHash('sha256').update(secret).digest();
}

@Injectable()
export class JourneyAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<JourneyAccessRequest>();
    const channel = request.authenticatedChannel;
    if (!channel) throw new UnauthorizedException();

    const requirement = this.reflector.get(RequiredJourneyOperation, context.getHandler());
    if (!requirement) throw new NotFoundException();
    const { operation, source } = requirement;
    const body = request.body;
    const rawId = source === 'body'
      ? body && typeof body === 'object' && Object.hasOwn(body, 'journeyId') && (body as { journeyId: unknown }).journeyId
      : request.params?.journeyId;
    const journeyId = typeof rawId === 'string' ? rawId.toLowerCase() : undefined;
    if (!journeyId || journeyId.length !== 36 || !journeyIdPattern.test(journeyId)) {
      if (source === 'body') throw new BadRequestException();
      throw new NotFoundException();
    }
    const digest = readGrantDigest(request);
    if (!digest) throw new NotFoundException();

    const grant = await this.prisma.client.journeyAccessGrant.findUnique({
      where: { digest: Uint8Array.from(digest) },
      select: {
        digest: true,
        channelId: true,
        actorRef: true,
        operations: true,
        expiresAt: true,
        revokedAt: true,
        journey: { select: { id: true } },
      },
    }).catch(() => {
      throw new ServiceUnavailableException();
    });

    if (!grant || grant.digest.length !== digest.length || !timingSafeEqual(grant.digest, digest) ||
        grant.channelId !== channel.id || grant.journey?.id !== journeyId || !grant.actorRef.trim() ||
        grant.expiresAt.getTime() <= Date.now() || grant.revokedAt ||
        !grant.operations.includes(operation)) {
      throw new NotFoundException();
    }

    request.journeyAccess = { journeyId, actorRef: grant.actorRef, operation };
    return true;
  }
}

export function RequireJourneyAccess(
  operation: JourneyGrantOperation,
  source: 'params' | 'body' = 'params',
): MethodDecorator {
  return applyDecorators(
    RequireChannelScopes(channelScopeByOperation[operation]),
    RequiredJourneyOperation({ operation, source }),
    UseGuards(JourneyAccessGuard),
  );
}
