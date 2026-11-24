import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { loadLocalEnv } from '../config/database';
import { ChannelScope } from '../generated/prisma/enums';
import { PrismaService } from '../persistence/prisma.service';
import { digestChannelSecret } from './channel-key';

function isChannelScope(value: string): value is ChannelScope {
  return value === ChannelScope.EVENTS_PUBLISH || value === ChannelScope.JOURNEYS_READ;
}

async function createCredential(): Promise<void> {
  const { values } = parseArgs({
    options: {
      channel: { type: 'string' },
      scope: { type: 'string', multiple: true },
    },
  });
  const channelCode = values.channel?.trim();
  const scopes = [...new Set(values.scope)];
  if (!channelCode || channelCode.length > 64 || !scopes.length || !scopes.every(isChannelScope)) {
    console.error('Indica --channel y al menos un --scope válido: EVENTS_PUBLISH o JOURNEYS_READ.');
    process.exitCode = 1;
    return;
  }

  loadLocalEnv();
  const prisma = new PrismaService();
  try {
    const channel = await prisma.client.channel.findUnique({
      where: { code: channelCode, isActive: true },
      select: { id: true },
    });
    if (!channel) {
      console.error('Se requiere un canal previamente registrado, activo y autorizado.');
      process.exitCode = 1;
      return;
    }

    const secret = randomBytes(32);
    const { keyId } = await prisma.client.channelCredential.create({
      data: {
        channelId: channel.id,
        secretDigest: Uint8Array.from(digestChannelSecret(secret)),
        scopes,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      select: { keyId: true },
    });
    process.stdout.write(`${keyId}.${secret.toString('base64url')}\n`);
  } finally {
    await prisma.onApplicationShutdown();
  }
}

void createCredential().catch(() => {
  console.error('No se pudo completar la emisión de la credencial de canal.');
  process.exitCode = 1;
});
