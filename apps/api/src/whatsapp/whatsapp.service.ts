import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { WHATSAPP_CONFIG, type WhatsAppConfig } from './whatsapp.config';
import { asArray, asObject, queueInput } from './whatsapp-input';

@Injectable()
export class WhatsAppService {
  constructor(
    @Inject(WHATSAPP_CONFIG) private readonly config: WhatsAppConfig,
    private readonly prisma: PrismaService,
  ) {}

  async accept(rawBody: Buffer): Promise<void> {
    let envelope: ReturnType<typeof asObject>;
    try {
      envelope = asObject(JSON.parse(rawBody.toString('utf8')));
    } catch {
      throw new BadRequestException('JSON inválido.');
    }
    if (envelope?.object !== 'whatsapp_business_account') return;
    const rows: Prisma.WhatsAppInboxCreateManyInput[] = [];

    for (const entry of asArray(envelope.entry)) {
      for (const change of asArray(asObject(entry)?.changes)) {
        const changeData = asObject(change);
        const value = asObject(changeData?.value);
        if (changeData?.field !== 'messages' || value?.messaging_product !== 'whatsapp' ||
            asObject(value.metadata)?.phone_number_id !== this.config.phoneNumberId) continue;

        for (const item of asArray(value.messages)) {
          const message = asObject(item);
          const id = message?.id;
          const from = message?.from;
          const timestamp = message?.timestamp;
          const body = asObject(message?.text)?.body;
          if (message?.type !== 'text' || typeof id !== 'string' || !/^wamid\.[A-Za-z0-9=+/_.-]{1,500}$/.test(id) ||
              typeof from !== 'string' || !/^[1-9][0-9]{1,14}$/.test(from) ||
              typeof timestamp !== 'string' || !/^\d{1,10}$/.test(timestamp) ||
              typeof body !== 'string' || !body.trim() || body.length > 500) continue;
          const receivedAt = new Date(Number(timestamp) * 1000);
          if (receivedAt.getTime() <= 0 || receivedAt.getTime() > Date.now() + 5 * 60_000) continue;
          rows.push({
            providerMessageId: id, phoneNumberId: this.config.phoneNumberId,
            sender: from, receivedAt, input: queueInput(body.trim()),
          });
        }
      }
    }

    if (rows.length) await this.prisma.client.whatsAppInbox.createMany({ data: rows, skipDuplicates: true });
  }
}
