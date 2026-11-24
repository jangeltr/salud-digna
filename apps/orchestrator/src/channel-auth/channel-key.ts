import { createHash } from 'node:crypto';

const bearerKey = /^Bearer ([\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})\.([a-z0-9_-]{43})$/i;

export function digestChannelSecret(secret: Uint8Array): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function parseChannelKey(header: string | undefined): { keyId: string; digest: Buffer } | undefined {
  const match = header?.match(bearerKey);
  if (!match || match[0] !== header) return undefined;

  const [, keyId, encodedSecret] = match;
  const secret = Buffer.from(encodedSecret, 'base64url');
  if (secret.length !== 32 || secret.toString('base64url') !== encodedSecret) return undefined;

  return { keyId, digest: digestChannelSecret(secret) };
}
