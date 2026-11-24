import { Module } from '@nestjs/common';
import { ChannelAuthModule } from '../channel-auth/channel-auth.module';
import { JourneyAccessGuard } from './journey-access.guard';

@Module({
  imports: [ChannelAuthModule],
  providers: [JourneyAccessGuard],
  exports: [JourneyAccessGuard, ChannelAuthModule],
})
export class JourneyAccessModule {}
