import { ForbiddenException } from '@nestjs/common';
import type { AccountDto } from '../auth/auth.dto';
import { Channel } from '../generated/prisma/enums';

export type WebRequestOrigin = { channel: typeof Channel.WEB; patientId: string; actorUserId: string };
export type RequestOrigin = WebRequestOrigin | { channel: typeof Channel.WHATSAPP; externalId: string };

export function webSession(user: AccountDto): WebRequestOrigin {
  if (!user.patientId) throw new ForbiddenException('La cuenta requiere un perfil de paciente.');
  return { channel: Channel.WEB, patientId: user.patientId, actorUserId: user.id };
}
