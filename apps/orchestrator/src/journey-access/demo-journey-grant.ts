import { createHash, randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import type { PrismaClient } from '../generated/prisma/client';
import { JourneyGrantOperation } from '../generated/prisma/enums';

const defaultDurationSeconds = 300;
const defaultMaxSeconds = 900;
const hardMaxSeconds = 3600;

export class DemoGrantError extends Error {}

interface DemoGrantOptions {
  channelCode: string;
  journeyId: string;
  actorRef: string;
  operations: JourneyGrantOperation[];
  durationSeconds: number;
}

function isGrantOperation(value: string): value is JourneyGrantOperation {
  return value === JourneyGrantOperation.READ_JOURNEY || value === JourneyGrantOperation.PUBLISH_EVENT;
}

function readSeconds(value: string, max: number, error: string): number {
  const seconds = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(seconds) || seconds > max) {
    throw new DemoGrantError(error);
  }
  return seconds;
}

export function parseDemoGrantOptions(args: string[], configuredMax?: string): DemoGrantOptions {
  const { values } = parseArgs({
    args,
    options: {
      channel: { type: 'string' },
      journey: { type: 'string' },
      actor: { type: 'string' },
      operation: { type: 'string', multiple: true },
      'duration-seconds': { type: 'string' },
    },
  });
  const channelCode = values.channel?.trim();
  const journeyId = values.journey?.toLowerCase();
  const actorRef = values.actor?.trim();
  const operations = [...new Set(values.operation)];
  if (!channelCode || channelCode.length > 64 ||
      !journeyId || journeyId.length !== 36 || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(journeyId) ||
      !actorRef || actorRef.length > 128 || actorRef.includes('\0') ||
      !operations.length || !operations.every(isGrantOperation)) {
    throw new DemoGrantError('Indica --channel, --journey con UUID, --actor y al menos un --operation válido.');
  }

  const maxSeconds = configuredMax === undefined ? defaultMaxSeconds : readSeconds(
    configuredMax, hardMaxSeconds, 'ORCHESTRATOR_DEMO_GRANT_MAX_SECONDS debe ser un entero entre 1 y 3600.',
  );
  const duration = values['duration-seconds'];
  const durationSeconds = duration === undefined ? Math.min(defaultDurationSeconds, maxSeconds) : readSeconds(
    duration, maxSeconds, 'La duración debe ser un entero positivo dentro del máximo configurado.',
  );
  return { channelCode, journeyId, actorRef, operations, durationSeconds };
}

export async function issueDemoJourneyGrant(
  prisma: Pick<PrismaClient, 'channel' | 'journey' | 'journeyAccessGrant'>,
  options: DemoGrantOptions,
): Promise<string> {
  const channel = await prisma.channel.findUnique({
    where: { code: options.channelCode, isActive: true },
    select: { id: true },
  });
  if (!channel) throw new DemoGrantError('El canal debe existir y estar activo.');

  const journey = await prisma.journey.findUnique({
    where: { id: options.journeyId },
    select: { id: true },
  });
  if (!journey) throw new DemoGrantError('El trámite de demostración debe existir.');

  const secret = randomBytes(32);
  const digest = createHash('sha256').update(secret).digest();
  const createdAt = new Date();
  await prisma.journeyAccessGrant.create({
    data: {
      channelId: channel.id,
      journeyId: journey.id,
      actorRef: options.actorRef,
      operations: options.operations,
      digest: Uint8Array.from(digest),
      createdAt,
      expiresAt: new Date(createdAt.getTime() + options.durationSeconds * 1000),
    },
    select: { id: true },
  });
  return secret.toString('base64url');
}
