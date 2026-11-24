import { Controller, Get, Header, Req, UnauthorizedException } from '@nestjs/common';
import { ChannelScope } from '../generated/prisma/enums';
import { RequireChannelScopes, type ChannelRequest } from './channel-auth.guard';

@Controller('channel-auth')
export class ChannelAuthController {
  @Get('verify')
  @Header('Cache-Control', 'no-store')
  @RequireChannelScopes(ChannelScope.JOURNEYS_READ)
  verify(@Req() request: ChannelRequest) {
    const channel = request.authenticatedChannel;
    if (!channel) throw new UnauthorizedException();

    return { authenticated: true, channelCode: channel.code, scopes: channel.scopes };
  }
}
