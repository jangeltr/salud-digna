import { Body, Controller, Header, NotFoundException, Post, Req, UnauthorizedException } from '@nestjs/common';
import { RequireChannelScopes } from '../channel-auth/channel-auth.guard';
import { ChannelScope, JourneyGrantOperation } from '../generated/prisma/enums';
import { ContinuityCodesService } from './continuity-codes.service';
import { RequireJourneyAccess, type JourneyAccessRequest } from './journey-access.guard';

@Controller()
export class ContinuityCodesController {
  constructor(private readonly codes: ContinuityCodesService) {}

  @Post('journeys/:journeyId/continuity-codes')
  @Header('Cache-Control', 'no-store')
  @RequireJourneyAccess(JourneyGrantOperation.PUBLISH_EVENT, 'params', JourneyGrantOperation.READ_JOURNEY)
  issue(@Req() request: JourneyAccessRequest) {
    const { authenticatedChannel, journeyAccess } = request;
    if (!authenticatedChannel || !journeyAccess) throw new NotFoundException();
    return this.codes.issue(authenticatedChannel.id, journeyAccess.journeyId, journeyAccess.grantId);
  }

  @Post('continuity-codes/redeem')
  @Header('Cache-Control', 'no-store')
  @RequireChannelScopes(ChannelScope.JOURNEYS_READ)
  redeem(@Req() request: JourneyAccessRequest, @Body() body: unknown) {
    if (!request.authenticatedChannel) throw new UnauthorizedException();
    return this.codes.redeem(request.authenticatedChannel.id, body);
  }
}
