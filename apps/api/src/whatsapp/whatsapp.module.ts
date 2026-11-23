import { Module, type DynamicModule } from '@nestjs/common';
import { TwilioMessagingClient } from './twilio-messaging.client';
import { TwilioWebhookController } from './twilio-webhook.controller';
import { WHATSAPP_SENDER } from './whatsapp-sender';
import { IdentityModule } from '../identity/identity.module';
import { PrismaModule } from '../persistence/prisma.module';
import { WhatsAppCloudApiClient } from './whatsapp-cloud-api.client';
import { WHATSAPP_CONFIG, loadWhatsAppConfig, selectedWhatsAppProvider, whatsappEnabled } from './whatsapp.config';
import { WhatsAppMessageProcessor } from './whatsapp-message-processor';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppWebhookVerifier } from './whatsapp-webhook-verifier';

@Module({})
export class WhatsAppModule {
  static register(conversation: DynamicModule): DynamicModule {
    const provider = selectedWhatsAppProvider();
    if (!whatsappEnabled()) return { module: WhatsAppModule };

    const sender = provider === 'meta' ? WhatsAppCloudApiClient : TwilioMessagingClient;
    return {
      module: WhatsAppModule,
      imports: [conversation, PrismaModule, IdentityModule],
      controllers: [provider === 'meta' ? WhatsAppWebhookController : TwilioWebhookController],
      providers: [
        { provide: WHATSAPP_CONFIG, useFactory: loadWhatsAppConfig },
        ...(provider === 'meta' ? [WhatsAppWebhookVerifier] : []),
        WhatsAppService, sender, WhatsAppMessageProcessor,
        { provide: WHATSAPP_SENDER, useExisting: sender },
      ],
    };
  }
}
