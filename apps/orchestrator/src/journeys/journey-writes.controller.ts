import { Body, Controller, Header, NotFoundException, Post, Req, UnauthorizedException } from '@nestjs/common';
import { RequireChannelScopes } from '../channel-auth/channel-auth.guard';
import { ChannelScope, JourneyGrantOperation } from '../generated/prisma/enums';
import { RequireJourneyAccess, type JourneyAccessRequest } from '../journey-access/journey-access.guard';
import { readJourneyEvent, validateJourneyCreation } from './journey-write-input';
import { JourneyWritesService } from './journey-writes.service';

@Controller()
export class JourneyWritesController {
  constructor(private readonly writes: JourneyWritesService) {}

  @Post('journeys')
  @Header('Cache-Control', 'no-store')
  @RequireChannelScopes(ChannelScope.EVENTS_PUBLISH)
  create(@Req() request: JourneyAccessRequest, @Body() body: unknown) {
    if (!request.authenticatedChannel) throw new UnauthorizedException();
    validateJourneyCreation(body);
    return this.writes.createAppointment(request.authenticatedChannel.id);
  }

  @Post('events')
  @Header('Cache-Control', 'no-store')
  @RequireJourneyAccess(JourneyGrantOperation.PUBLISH_EVENT, 'body')
  publish(@Req() request: JourneyAccessRequest, @Body() body: unknown) {
    const { authenticatedChannel, journeyAccess } = request;
    if (!authenticatedChannel || !journeyAccess) throw new NotFoundException();
    return this.writes.publish({
      channelId: authenticatedChannel.id, journeyId: journeyAccess.journeyId, actorRef: journeyAccess.actorRef,
    }, readJourneyEvent(body));
  }
}
