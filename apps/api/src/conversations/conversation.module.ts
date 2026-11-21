import { Module, type DynamicModule } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuthModule } from '../auth/auth.module';
import { ClinicsModule } from '../clinics/clinics.module';
import { conversationSimulationEnabled } from '../config/conversation-simulation';
import { PrismaModule } from '../persistence/prisma.module';
import { RequestsModule } from '../requests/requests.module';
import { StudiesModule } from '../studies/studies.module';
import { CONVERSATION_INTERPRETER, SpanishConversationInterpreter } from './conversation-interpreter';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

@Module({
  imports: [AuthModule, PrismaModule, RequestsModule, AppointmentsModule, ClinicsModule, StudiesModule],
  providers: [
    ConversationService,
    { provide: CONVERSATION_INTERPRETER, useClass: SpanishConversationInterpreter },
  ],
  exports: [ConversationService],
})
export class ConversationModule {
  static register(): DynamicModule {
    return {
      module: ConversationModule,
      controllers: conversationSimulationEnabled() ? [ConversationController] : [],
    };
  }
}
