import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { WHATSAPP_CONFIG, type MetaConfig } from './whatsapp.config';

@Injectable()
export class WhatsAppWebhookVerifier {
  constructor(@Inject(WHATSAPP_CONFIG) private readonly config: MetaConfig) {}

  challenge(mode: unknown, token: unknown, challenge: unknown): string {
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (mode !== 'subscribe' || typeof token !== 'string' || token.length > 512 ||
        typeof challenge !== 'string' || !/^\d{1,128}$/.test(challenge) ||
        !timingSafeEqual(digest(token), digest(this.config.verifyToken))) {
      throw new ForbiddenException('Verificación rechazada.');
    }
    return challenge;
  }

  verify(body: Buffer | undefined, signature: unknown): asserts body is Buffer {
    if (!Buffer.isBuffer(body) || typeof signature !== 'string' || !/^sha256=[0-9a-f]{64}$/i.test(signature)) {
      throw new UnauthorizedException('Firma inválida.');
    }
    const expected = createHmac('sha256', this.config.appSecret).update(body).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) {
      throw new UnauthorizedException('Firma inválida.');
    }
  }
}
