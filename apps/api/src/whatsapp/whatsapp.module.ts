import { Module, type DynamicModule } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PrismaModule } from '../persistence/prisma.module';
import { WhatsAppCloudApiClient } from './whatsapp-cloud-api.client';
import { WHATSAPP_CONFIG, loadWhatsAppConfig, whatsappEnabled } from './whatsapp.config';
import { WhatsAppMessageProcessor } from './whatsapp-message-processor';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppWebhookVerifier } from './whatsapp-webhook-verifier';

@Module({})
export class WhatsAppModule {
  static register(conversation: DynamicModule): DynamicModule {
    if (!whatsappEnabled()) return { module: WhatsAppModule };

    return {
      module: WhatsAppModule,
      imports: [conversation, PrismaModule, IdentityModule],
      controllers: [WhatsAppWebhookController],
      providers: [
        { provide: WHATSAPP_CONFIG, useFactory: loadWhatsAppConfig },
        WhatsAppWebhookVerifier, WhatsAppService, WhatsAppCloudApiClient, WhatsAppMessageProcessor,
      ],
    };
  }
}
