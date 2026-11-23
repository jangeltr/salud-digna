import {
  HttpException, Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit,
} from '@nestjs/common';
import type { ConversationReplyDto } from '../conversations/conversation.dto';
import { ConversationService } from '../conversations/conversation.service';
import type { VerifiedWhatsAppMessage } from '../conversations/whatsapp-adapter';
import { Prisma, type WhatsAppInbox } from '../generated/prisma/client';
import { Channel, WhatsAppInboxStatus } from '../generated/prisma/enums';
import { IdentityService } from '../identity/identity.service';
import { PrismaService } from '../persistence/prisma.service';
import { WHATSAPP_SENDER, WhatsAppDeliveryError, type WhatsAppSender } from './whatsapp-sender';
import { WHATSAPP_CONFIG, type WhatsAppConfig } from './whatsapp.config';
import { asObject, conversationInput } from './whatsapp-input';

const LEASE_MS = 120_000;
const WINDOW_MS = 24 * 60 * 60_000;
const MAX_DELIVERY_ATTEMPTS = 3;
const linkInstructions = 'Vincula tu cuenta desde el portal de Salud Digna. Solicita un código para WhatsApp y envía «vincular ID_DE_VINCULACIÓN CÓDIGO» en este chat.';
const selectionCommands = { SELECT_STUDY: 'estudio', SELECT_CLINIC: 'clinica', SELECT_DATETIME: 'fecha' } as const;

function formatReply(response: ConversationReplyDto): string {
  const options: string[] = [];
  for (const choice of response.suggestedActions ?? []) {
    if (choice.type === 'SELECT_REQUEST' && choice.requestId) {
      options.push(`${choice.label}: solicitud ${choice.requestId}`);
    } else if (choice.type === 'SELECT_STUDY' || choice.type === 'SELECT_CLINIC' || choice.type === 'SELECT_DATETIME') {
      if (choice.requestId && response.version !== null) {
        options.push(`${choice.label}: seleccionar ${selectionCommands[choice.type]} ${choice.requestId} ${response.version} ${choice.value ?? 'FECHA_ISO_CON_ZONA'}`);
      }
    } else {
      options.push(choice.label);
    }
  }
  return [response.reply, ...options].join('\n').slice(0, 3500);
}

@Injectable()
export class WhatsAppMessageProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppMessageProcessor.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;

  constructor(
    @Inject(WHATSAPP_CONFIG) private readonly config: WhatsAppConfig,
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly conversation: ConversationService,
    @Inject(WHATSAPP_SENDER) private readonly sender: WhatsAppSender,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  private tick(): void {
    if (this.running) return;
    this.running = this.processNext()
      .catch(() => this.logger.warn('No se pudo avanzar la cola local de WhatsApp.'))
      .finally(() => { this.running = undefined; });
  }

  private async processNext(): Promise<void> {
    const inbox = this.prisma.client.whatsAppInbox;
    const { provider, recipientKey } = this.config;
    const scope = { provider, recipientKey };
    const now = new Date();
    await inbox.updateMany({
      where: { ...scope, status: 'PREPARING', nextAttemptAt: { lte: now } },
      data: { status: 'FAILED', lastError: 'preparation_interrupted', input: Prisma.DbNull, sender: null },
    });
    await inbox.updateMany({
      where: { ...scope, status: 'SENDING', nextAttemptAt: { lte: now }, ...(provider === 'META' && { attempts: { gte: MAX_DELIVERY_ATTEMPTS } }) },
      data: { status: 'FAILED', lastError: 'delivery_interrupted', sender: null, reply: null },
    });
    const item = await inbox.findFirst({
      where: { ...scope, status: { in: ['PENDING', 'READY', 'SENDING'] }, nextAttemptAt: { lte: now } },
      orderBy: [{ nextAttemptAt: 'asc' }, { providerMessageId: 'asc' }],
    });
    if (!item) return;

    const preparing = item.status === WhatsAppInboxStatus.PENDING;
    const status = preparing ? WhatsAppInboxStatus.PREPARING : WhatsAppInboxStatus.SENDING;
    const lease = new Date(Date.now() + LEASE_MS);
    const claimed = await inbox.updateMany({
      where: { ...scope, providerMessageId: item.providerMessageId, status: item.status, nextAttemptAt: item.nextAttemptAt },
      data: { status, nextAttemptAt: lease, ...(!preparing && { attempts: { increment: 1 } }) },
    });
    if (!claimed.count) return;

    const owned = { ...scope, providerMessageId: item.providerMessageId, status, nextAttemptAt: lease };
    if (Date.now() - item.receivedAt.getTime() >= WINDOW_MS) {
      await inbox.updateMany({ where: owned, data: {
        status: 'FAILED', lastError: 'service_window_expired', sender: null, reply: null, input: Prisma.DbNull,
      } });
      return;
    }

    if (preparing) {
      let reply: string;
      try {
        reply = await this.prepare(item);
      } catch {
        await inbox.updateMany({ where: owned, data: {
          status: 'FAILED', lastError: 'preparation_failed', input: Prisma.DbNull, sender: null,
        } });
        return;
      }
      await inbox.updateMany({ where: owned, data: {
        status: 'READY', reply, input: Prisma.DbNull, nextAttemptAt: new Date(),
      } });
      return;
    }

    let outboundMessageId: string;
    try {
      if (!item.sender || !item.reply) throw new WhatsAppDeliveryError('missing_prepared_reply', false);
      outboundMessageId = await this.sender.sendText(item.sender, item.reply);
    } catch (error) {
      const attempts = item.attempts + 1;
      const retry = error instanceof WhatsAppDeliveryError && error.retryable && attempts < MAX_DELIVERY_ATTEMPTS;
      const lastError = error instanceof WhatsAppDeliveryError ? error.category : 'delivery_failed';
      await inbox.updateMany({ where: owned, data: retry
        ? { status: 'READY', nextAttemptAt: new Date(Date.now() + Math.max(attempts * 5000, error instanceof WhatsAppDeliveryError ? error.retryAfterMs : 0)), lastError }
        : { status: 'FAILED', reply: null, sender: null, lastError },
      });
      return;
    }
    await inbox.updateMany({ where: owned, data: {
      status: 'SENT', outboundMessageId, lastError: null, sender: null, reply: null,
    } });
  }

  private async prepare(item: WhatsAppInbox): Promise<string> {
    const input = asObject(item.input);
    const externalId = `+${item.sender}`;
    if (input?.kind === 'invalid_link') return linkInstructions;
    if (input?.kind === 'link' && typeof input.linkId === 'string' && typeof input.digest === 'string') {
      try {
        await this.identity.linkTrustedIdentityByDigest(Channel.WHATSAPP, externalId, input.linkId, input.digest);
        return 'Tu cuenta quedó vinculada. Escribe «continuar» para consultar tu avance.';
      } catch (error) {
        if (error instanceof HttpException && [400, 409].includes(error.getStatus())) {
          return 'No pude validar la vinculación. Solicita un nuevo código desde el portal e inténtalo nuevamente.';
        }
        throw error;
      }
    }

    const resolution = await this.identity.resolveVerifiedIdentity(Channel.WHATSAPP, externalId);
    if (resolution.status !== 'VERIFIED') return linkInstructions;
    if (input?.kind !== 'message' || typeof input.message !== 'string') throw new Error('Entrada inválida.');
    const dto = conversationInput(input.message);
    if (!dto) return 'Revisa el formato de la opción e inténtalo nuevamente. Escribe «continuar» para ver tu avance.';
    const message: VerifiedWhatsAppMessage = {
      providerMessageId: item.providerMessageId,
      origin: { channel: Channel.WHATSAPP, externalId },
      input: dto,
    };
    try {
      return formatReply(await this.conversation.respond(message.origin, message.input));
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      switch (error.getStatus()) {
        case 400: return 'No pude guardar la selección. Revisa la opción y el formato antes de intentarlo nuevamente.';
        case 403:
        case 404: return 'No hay una solicitud accesible con esa referencia. Consulta tu cuenta en el portal.';
        case 409: return 'La solicitud cambió o se cerró. Consulta su estado antes de enviar otra selección.';
        default: throw error;
      }
    }
  }
}
