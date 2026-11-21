import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { IdentityModule } from './identity/identity.module';
import { RequestsModule } from './requests/requests.module';
import { ClinicsModule } from './clinics/clinics.module';
import { StudiesModule } from './studies/studies.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { CallCenterModule } from './call-center/call-center.module';
import { JourneyModule } from './journey/journey.module';
import { AdminMonitoringModule } from './admin-monitoring/admin-monitoring.module';

@Module({ imports: [HealthModule, AuthModule, IdentityModule, RequestsModule, ClinicsModule, StudiesModule, AppointmentsModule, CallCenterModule, JourneyModule, AdminMonitoringModule] })
export class AppModule {}
