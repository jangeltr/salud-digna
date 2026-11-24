import { Controller, Get, Header, NotFoundException, Query, Req } from '@nestjs/common';
import { JourneyGrantOperation } from '../generated/prisma/enums';
import { RequireJourneyAccess, type JourneyAccessRequest } from '../journey-access/journey-access.guard';
import { JourneyQueriesService, type JourneyReadAccess } from './journey-queries.service';

function readAccess(request: JourneyAccessRequest): JourneyReadAccess {
  const { authenticatedChannel, journeyAccess } = request;
  if (!authenticatedChannel || !journeyAccess) throw new NotFoundException();

  return { channelId: authenticatedChannel.id, journeyId: journeyAccess.journeyId, actorRef: journeyAccess.actorRef };
}

@Controller('journeys')
export class JourneyQueriesController {
  constructor(private readonly queries: JourneyQueriesService) {}

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
