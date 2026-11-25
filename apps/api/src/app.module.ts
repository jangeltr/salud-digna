import { Module, type DynamicModule } from '@nestjs/common';
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
import { MobileJourneysModule } from './mobile-journeys/mobile-journeys.module';

import { ConversationModule } from './conversations/conversation.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
@Module({ imports: [HealthModule, AuthModule, IdentityModule, RequestsModule, ClinicsModule, StudiesModule, AppointmentsModule, CallCenterModule, JourneyModule, AdminMonitoringModule, MobileJourneysModule] })
export class AppModule {
  static configure(): DynamicModule {
    const conversation = ConversationModule.register();
    return { module: AppModule, imports: [conversation, WhatsAppModule.register(conversation)] };
  }
}
