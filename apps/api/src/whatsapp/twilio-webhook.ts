import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { TwilioConfig } from './whatsapp.config';
import { queueInput } from './whatsapp-input';

export const TWILIO_MESSAGE_SID = /^(?:SM|MM)[0-9a-f]{32}$/i;

export function verifyTwilioForm(raw: Buffer | undefined, signature: unknown, originalUrl: string, config: TwilioConfig) {
  const querySuffix = (url: string) => url.slice(url.indexOf('?') < 0 ? url.length : url.indexOf('?'));
  if (!raw || typeof signature !== 'string' || !/^[A-Za-z0-9+/]{27}=$/.test(signature) ||
      querySuffix(originalUrl) !== querySuffix(config.webhookUrl)) {
    throw new UnauthorizedException('Firma inválida.');
  }

  const form = new URLSearchParams(raw.toString('utf8'));
  const keys = [...new Set(form.keys())].sort();
  const hmac = createHmac('sha1', config.authToken).update(config.webhookUrl);
  for (const key of keys) {
    for (const value of [...new Set(form.getAll(key))].sort()) hmac.update(key).update(value);
  }

  if (!timingSafeEqual(hmac.digest(), Buffer.from(signature, 'base64'))) {
    throw new UnauthorizedException('Firma inválida.');
  }
  return form;
}

export function normalizeTwilio(form: URLSearchParams, config: TwilioConfig, now = new Date()): Prisma.WhatsAppInboxCreateManyInput | undefined {
  for (const field of ['MessageSid', 'AccountSid', 'From', 'To', 'Body', 'NumMedia']) {
    if (form.getAll(field).length !== 1) return undefined;
  }

  const id = form.get('MessageSid');
  const sender = /^whatsapp:\+([1-9]\d{1,14})$/.exec(form.get('From') ?? '');
  const text = form.get('Body')?.trim();
  if (!id || !TWILIO_MESSAGE_SID.test(id) ||
      ['MessageStatus', 'SmsStatus'].some((field) => form.getAll(field).some((value) => value !== 'received')) ||
      form.get('AccountSid') !== config.accountSid || form.get('To') !== config.from ||
      form.get('NumMedia') !== '0' || !sender || !text || text.length > 500) return undefined;

  return {
    provider: 'TWILIO', providerMessageId: id, recipientKey: config.recipientKey,
    sender: sender[1], receivedAt: now, input: queueInput(text),
  };
}
