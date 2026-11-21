import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AccountDto } from './auth.dto';

export interface AuthRequest {
  headers: { authorization?: string };
  user?: AccountDto;
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<AuthRequest>().user;
});
