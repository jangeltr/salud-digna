import { Controller, Get, Header, NotFoundException, Query, Req, UnauthorizedException } from '@nestjs/common';
import { RequireChannelScopes } from '../channel-auth/channel-auth.guard';
import { ChannelScope, JourneyGrantOperation } from '../generated/prisma/enums';
import { RequireJourneyAccess, type JourneyAccessRequest } from '../journey-access/journey-access.guard';
import { JourneyQueriesService, type JourneyReadAccess } from './journey-queries.service';
import { PatientIdentityService } from './patient-identity';

function readAccess(request: JourneyAccessRequest): JourneyReadAccess {
  const { authenticatedChannel, journeyAccess } = request;
  if (!authenticatedChannel || !journeyAccess) throw new NotFoundException();

  return { channelId: authenticatedChannel.id, journeyId: journeyAccess.journeyId, actorRef: journeyAccess.actorRef };
}

@Controller('journeys')
export class JourneyQueriesController {
  constructor(private readonly queries: JourneyQueriesService, private readonly identities: PatientIdentityService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequireChannelScopes(ChannelScope.JOURNEYS_READ)
  async listPatientJourneys(@Req() request: JourneyAccessRequest) {
    if (!request.authenticatedChannel) throw new UnauthorizedException();
    const { id: channelId } = request.authenticatedChannel;
    const patient = await this.identities.resolve(request, channelId);
    return this.queries.listPatientJourneys(channelId, patient);
  }

  @Get(':journeyId')
  @Header('Cache-Control', 'no-store')
  @RequireJourneyAccess(JourneyGrantOperation.READ_JOURNEY)
  getJourney(@Req() request: JourneyAccessRequest) {
    return this.queries.getJourney(readAccess(request));
  }

  @Get(':journeyId/context')
  @Header('Cache-Control', 'no-store')
  @RequireJourneyAccess(JourneyGrantOperation.READ_JOURNEY)
  getContext(@Req() request: JourneyAccessRequest) {
    return this.queries.getContext(readAccess(request));
  }

  @Get(':journeyId/history')
  @Header('Cache-Control', 'no-store')
  @RequireJourneyAccess(JourneyGrantOperation.READ_JOURNEY)
  getHistory(@Req() request: JourneyAccessRequest, @Query('limit') limit: unknown, @Query('cursor') cursor: unknown) {
    return this.queries.getHistory(readAccess(request), limit, cursor);
  }
}
