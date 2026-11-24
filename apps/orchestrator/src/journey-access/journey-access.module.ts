import { Module } from '@nestjs/common';
import { ChannelAuthModule } from '../channel-auth/channel-auth.module';
import { ContinuityCodesController } from './continuity-codes.controller';
import { ContinuityCodesService } from './continuity-codes.service';
import { JourneyAccessGuard } from './journey-access.guard';

@Module({
  imports: [ChannelAuthModule],
  controllers: [ContinuityCodesController],
  providers: [JourneyAccessGuard, ContinuityCodesService],
  exports: [JourneyAccessGuard, ChannelAuthModule],
})
export class JourneyAccessModule {}
