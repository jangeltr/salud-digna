import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { ChannelScope } from '../generated/prisma/enums';
import { PrismaService } from '../persistence/prisma.service';
import { parseChannelKey } from './channel-key';

export interface AuthenticatedChannel {
  readonly id: string;
  readonly code: string;
  readonly scopes: readonly ChannelScope[];
}

export interface ChannelRequest extends IncomingMessage {
  authenticatedChannel?: AuthenticatedChannel;
}

const RequiredChannelScopes = Reflector.createDecorator<ChannelScope[]>();

@Injectable()
export class ChannelAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ChannelRequest>();
    const key = parseChannelKey(request.headers.authorization);
    if (!key || (request.headersDistinct?.authorization?.length ?? 0) > 1) throw new UnauthorizedException();

    const credential = await this.prisma.client.channelCredential.findUnique({
      where: { keyId: key.keyId },
      select: {
        secretDigest: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
        channel: { select: { id: true, code: true, isActive: true } },
      },
    }).catch(() => {
      throw new ServiceUnavailableException();
    });

    if (!credential || credential.secretDigest.length !== key.digest.length ||
        !timingSafeEqual(credential.secretDigest, key.digest) || credential.revokedAt ||
        (credential.expiresAt && credential.expiresAt.getTime() <= Date.now()) ||
        !credential.channel.isActive) {
      throw new UnauthorizedException();
    }

    const required = this.reflector.getAllAndMerge(RequiredChannelScopes, [context.getHandler(), context.getClass()]);
    if (!required.every((scope) => credential.scopes.includes(scope))) throw new ForbiddenException();

    request.authenticatedChannel = {
      id: credential.channel.id,
      code: credential.channel.code,
      scopes: credential.scopes,
    };
    return true;
  }
}

export function RequireChannelScopes(...scopes: ChannelScope[]) {
  return applyDecorators(RequiredChannelScopes(scopes), UseGuards(ChannelAuthGuard));
}
