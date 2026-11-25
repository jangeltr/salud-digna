import { BadRequestException, Body, Controller, Header, NotFoundException, Post, Req, UnauthorizedException } from '@nestjs/common';
import { RequireChannelScopes } from '../channel-auth/channel-auth.guard';
import { ChannelScope, JourneyGrantOperation } from '../generated/prisma/enums';
import { RequireJourneyAccess, type JourneyAccessRequest } from '../journey-access/journey-access.guard';
import { creationRequestDigest, readCreationKey, readJourneyEvent } from './journey-write-input';
import { JourneyWritesService } from './journey-writes.service';
import { PatientIdentityService } from './patient-identity';

@Controller()
export class JourneyWritesController {
  constructor(private readonly writes: JourneyWritesService, private readonly identities: PatientIdentityService) {}

  @Post('journeys')
  @Header('Cache-Control', 'no-store')
  @RequireChannelScopes(ChannelScope.EVENTS_PUBLISH)
  create(@Req() request: JourneyAccessRequest, @Body() body: unknown) {
    if (!request.authenticatedChannel) throw new UnauthorizedException();
    if ((request.headersDistinct?.['idempotency-key']?.length ?? 0) > 1) throw new BadRequestException();
    const keyDigest = readCreationKey(request.headers['idempotency-key']);
    const channelId = request.authenticatedChannel.id;
    if (request.headers['x-patient-assertion'] !== undefined) {
      return this.identities.resolve(request, channelId, creationRequestDigest(body) !== undefined).then((patient) =>
        this.writes.createAppointment(channelId, keyDigest, creationRequestDigest(body, patient), patient));
    }
    return this.writes.createAppointment(channelId, keyDigest, creationRequestDigest(body));
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
