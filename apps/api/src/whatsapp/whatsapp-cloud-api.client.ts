import { Inject, Injectable } from '@nestjs/common';
import { WHATSAPP_CONFIG, type MetaConfig } from './whatsapp.config';
import { asArray, asObject } from './whatsapp-input';

import { WhatsAppDeliveryError, type WhatsAppSender } from './whatsapp-sender';

@Injectable()
export class WhatsAppCloudApiClient implements WhatsAppSender {
  constructor(@Inject(WHATSAPP_CONFIG) private readonly config: MetaConfig) {}

  async sendText(to: string, body: string): Promise<string> {
    const { version, phoneNumberId, accessToken } = this.config;
    let response: Response;
    try {
      response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
      });
    } catch {
      throw new WhatsAppDeliveryError('network_or_timeout', true);
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new WhatsAppDeliveryError(`meta_http_${response.status}`,
        [408, 429].includes(response.status) || response.status >= 500);
    }

    const data = asObject(await response.json().catch(() => undefined));
    const id = asObject(asArray(data?.messages)[0])?.id;
    if (typeof id !== 'string' || !/^wamid\.[A-Za-z0-9=+/_.-]{1,500}$/.test(id)) {
      throw new WhatsAppDeliveryError('invalid_meta_response', true);
    }
    return id;
  }
}
