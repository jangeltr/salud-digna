import { Inject, Injectable } from '@nestjs/common';
import { TWILIO_MESSAGE_SID } from './twilio-webhook';
import { WHATSAPP_CONFIG, type TwilioConfig } from './whatsapp.config';
import { asObject } from './whatsapp-input';
import { WhatsAppDeliveryError, type WhatsAppSender } from './whatsapp-sender';

@Injectable()
export class TwilioMessagingClient implements WhatsAppSender {
  constructor(@Inject(WHATSAPP_CONFIG) private readonly config: TwilioConfig) {}

  async sendText(to: string, body: string): Promise<string> {
    const { accountSid, authToken, from } = this.config;
    const limited = body.slice(0, 1600);
    const text = body.length > 1600 && limited.includes('\n') ? limited.slice(0, limited.lastIndexOf('\n')) : limited;
    let response: Response;
    try {
      response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` },
        body: new URLSearchParams({ From: from, To: `whatsapp:+${to}`, Body: text }),
      });
    } catch {
      throw new WhatsAppDeliveryError('twilio_delivery_uncertain', false);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const header = response.headers.get('retry-after');
      const delay = header && /^\d+$/.test(header) ? Math.min(Number(header), 86400) * 1000 : 0;
      throw new WhatsAppDeliveryError(`twilio_http_${response.status}`, response.status === 429, delay);
    }

    const result = asObject(await response.json().catch(() => undefined));
    if (!result || typeof result.sid !== 'string' || !TWILIO_MESSAGE_SID.test(result.sid) ||
        typeof result.status !== 'string') {
      throw new WhatsAppDeliveryError('twilio_invalid_response', false);
    }
    if (['failed', 'undelivered', 'canceled'].includes(result.status)) {
      throw new WhatsAppDeliveryError('twilio_send_rejected', false);
    }
    return result.sid;
  }
}
