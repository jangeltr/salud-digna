import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuthAttemptsGuard } from '../auth/auth-attempts.guard';
import { AuthModule } from '../auth/auth.module';
import { JourneyModule } from '../journey/journey.module';
import { PrismaModule } from '../persistence/prisma.module';
import { RequestsModule } from '../requests/requests.module';
import { CallCenterController } from './call-center.controller';
import { CallCenterService } from './call-center.service';

@Module({
  imports: [AuthModule, PrismaModule, RequestsModule, AppointmentsModule, JourneyModule],
  controllers: [CallCenterController],
  providers: [CallCenterService, AuthAttemptsGuard],
})
export class CallCenterModule {}
