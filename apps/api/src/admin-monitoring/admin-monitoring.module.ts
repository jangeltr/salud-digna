import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JourneyModule } from '../journey/journey.module';
import { PrismaModule } from '../persistence/prisma.module';
import { AdminMonitoringController } from './admin-monitoring.controller';
import { AdminMonitoringService } from './admin-monitoring.service';

@Module({
  imports: [AuthModule, PrismaModule, JourneyModule],
  controllers: [AdminMonitoringController],
  providers: [AdminMonitoringService],
})
export class AdminMonitoringModule {}
