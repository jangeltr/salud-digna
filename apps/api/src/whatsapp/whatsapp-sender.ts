export const WHATSAPP_SENDER = Symbol('WHATSAPP_SENDER');

export interface WhatsAppSender {
  sendText(to: string, body: string): Promise<string>;
}

export class WhatsAppDeliveryError extends Error {
  constructor(readonly category: string, readonly retryable: boolean, readonly retryAfterMs = 0) {
    super(category);
  }
}
