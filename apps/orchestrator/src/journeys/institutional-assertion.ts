import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createPublicKey, verify } from 'node:crypto';

const issuer = 'https://api.salud-digna.app';
const audience = 'https://orchestrator.salud-digna.app';
const reference = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function isReference(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && reference.test(value);
}

function decode(value: string): Buffer {
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) throw new NotFoundException();
  return bytes;
}

function json(value: string): Record<string, unknown> {
  try {
    const result: unknown = JSON.parse(decode(value).toString('utf8'));
    if (result && typeof result === 'object' && !Array.isArray(result)) return result as Record<string, unknown>;
  } catch { /* Invalid assertion. */ }
  throw new NotFoundException();
}

export function verifyInstitutionalAssertion(raw: string, channelCode: string) {
  if (raw.length > 2048 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(raw)) throw new NotFoundException();
  const [header, claims, encodedSignature] = raw.split('.');
  const metadata = json(header);
  if (metadata.alg !== 'EdDSA' || metadata.typ !== 'sd-patient+jwt' || Object.keys(metadata).length !== 2) {
    throw new NotFoundException();
  }
  const signature = decode(encodedSignature);
  if (signature.length !== 64) throw new NotFoundException();

  let key;
  try {
    const pem = process.env.ORCHESTRATOR_CENTRAL_ASSERTION_PUBLIC_KEY?.trim();
    if (!pem?.startsWith('-----BEGIN PUBLIC KEY-----\n') || !pem.endsWith('-----END PUBLIC KEY-----')) {
      throw new Error();
    }
    key = createPublicKey(pem);
  } catch {
    throw new ServiceUnavailableException();
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new ServiceUnavailableException();
  if (!verify(null, Buffer.from(`${header}.${claims}`), key, signature)) throw new NotFoundException();

  const { iss, aud, channel, scope, sub, customerId, jti, iat, exp } = json(claims);
  const now = Math.floor(Date.now() / 1000);
  if (iss !== issuer || aud !== audience || channel !== channelCode || scope !== 'journeys:patient' ||
      !isReference(sub) || !isReference(customerId) || !isReference(jti) ||
      typeof iat !== 'number' || typeof exp !== 'number' ||
      !Number.isSafeInteger(iat) || !Number.isSafeInteger(exp) || iat > now || exp <= now || exp - iat > 300) {
    throw new NotFoundException();
  }
  return { customerId, actorRef: sub, verificationRef: jti, expiresAt: new Date(exp * 1000) };
}
