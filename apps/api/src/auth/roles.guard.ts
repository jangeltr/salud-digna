import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../generated/prisma/enums';
import type { AuthRequest } from './authenticated-user';

export const Roles = Reflector.createDecorator<UserRole[]>();

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride(Roles, [context.getHandler(), context.getClass()]);
    if (!roles?.length) {
      return true;
    }

    const user = context.switchToHttp().getRequest<AuthRequest>().user;
    if (!user) {
      throw new UnauthorizedException();
    }

    return roles.includes(user.role);
  }
}
