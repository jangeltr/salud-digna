import { Injectable, NotFoundException } from '@nestjs/common';
import { Channel } from '../generated/prisma/enums';
import type { ConfirmIdentityLinkDto } from './identity.dto';
import { IdentityService, type IdentityPatient } from './identity.service';

const fixtures: Record<Channel, string> = {
  WEB: 'web-demo',
  WHATSAPP: '+12025550100',
  MOBILE: 'mobile-demo',
  CALL_CENTER: 'call-center-demo',
};

@Injectable()
export class IdentityDevelopmentAdapter {
  constructor(private readonly identity: IdentityService) {}

  confirm(actor: IdentityPatient, input: ConfirmIdentityLinkDto) {
    if (process.env.NODE_ENV !== 'development' || process.env.IDENTITY_SIMULATOR_ENABLED !== 'true') {
      throw new NotFoundException();
    }

    return this.identity.linkSimulatedIdentity(
      actor,
      input.provider,
      fixtures[input.provider],
      input.linkId,
      input.code,
    );
  }
}
