import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MobileJourneysController } from './mobile-journeys.controller';
import { MobileJourneysService } from './mobile-journeys.service';

@Module({
  imports: [AuthModule],
  controllers: [MobileJourneysController],
  providers: [MobileJourneysService],
})
export class MobileJourneysModule {}
