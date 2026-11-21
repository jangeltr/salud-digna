import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { AuthService } from './auth.service';
import type { AuthRequest } from './authenticated-user';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = /^Bearer ([^\s,]+)$/i.exec(request.headers.authorization ?? '')?.[1];

    if (!token) {
      throw new UnauthorizedException();
    }

    let claims: { sub?: unknown; role?: unknown; exp?: unknown };
    try {
      claims = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }

    if (typeof claims.sub !== 'string' || !isUUID(claims.sub) || !Number.isSafeInteger(claims.exp)) {
      throw new UnauthorizedException();
    }

    const user = await this.auth.findActiveAccount(claims.sub);
    if (!user || user.role !== claims.role) {
      throw new UnauthorizedException();
    }

    request.user = user;
    return true;
  }
}
