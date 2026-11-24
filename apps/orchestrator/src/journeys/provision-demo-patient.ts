import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadLocalEnv, readDatabaseUrl } from '../config/database';
import { PrismaService } from '../persistence/prisma.service';
import { customerNamespace, digestCustomerId, opaqueRef, readIdentityKey, signPatientAssertion } from './patient-identity';

class ConcurrentIdentityLink extends Error {}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    channel: { type: 'string' }, actor: { type: 'string' }, 'verification-ref': { type: 'string' },
  } });
  const { channel, actor, 'verification-ref': verificationRef } = values;
  if (!channel || channel.length > 64 || !actor || !opaqueRef.test(actor) || actor.trim() !== actor ||
      !verificationRef || !opaqueRef.test(verificationRef) || verificationRef.trim() !== verificationRef) {
    throw new Error();
  }
  const customerId = readFileSync(0, 'utf8').trim();
  if (!opaqueRef.test(customerId)) throw new Error();

  loadLocalEnv();
  if (readDatabaseUrl()?.hostname !== '127.0.0.1') throw new Error();
  const key = readIdentityKey();
  const digest = digestCustomerId(key, customerId);
  const prisma = new PrismaService();
  try {
    const registeredChannel = await prisma.client.channel.findUnique({
      where: { code: channel, isActive: true }, select: { id: true },
    });
    if (!registeredChannel) throw new Error();
    const channelId = registeredChannel.id;
    const identity = { type: 'CUSTOMER_ID' as const, namespace: customerNamespace, verifiedLookupDigest: digest };
    const resolve = (create: boolean) => prisma.client.$transaction(async (tx) => {
      const existing = await tx.patientIdentifier.findUnique({
        where: { type_namespace_verifiedLookupDigest: identity },
        select: { id: true, status: true, validUntil: true, revokedAt: true },
      });
      if (existing) {
        if (existing.status !== 'VERIFIED' || existing.revokedAt ||
            (existing.validUntil && existing.validUntil <= new Date())) throw new Error();
        return existing.id;
      }
      if (!create) throw new Error();
      if (await tx.patientIdentifier.findFirst({
        where: { type: identity.type, namespace: customerNamespace, lookupDigest: digest },
        select: { id: true },
      })) throw new ConcurrentIdentityLink();
      const subject = await tx.patientSubject.create({ data: {}, select: { id: true } });
      const now = new Date();
      const [linked] = await tx.patientIdentifier.createManyAndReturn({
        data: {
          ...identity, lookupDigest: digest, patientSubjectId: subject.id, sourceChannelId: channelId,
          status: 'VERIFIED', verificationMethod: 'DEMO_OPERATOR', verificationRef, createdAt: now, verifiedAt: now,
        },
        select: { id: true },
        skipDuplicates: true,
      });
      if (!linked) throw new ConcurrentIdentityLink();
      await tx.accessAudit.create({
        data: {
          patientSubjectId: subject.id, channelId, action: 'VERIFY_IDENTIFIER', outcome: 'ALLOWED',
          reasonCode: 'DEMO_OPERATOR_CUSTOMER_ID',
        },
        select: { id: true },
      });
      return linked.id;
    });
    let identifierId: string;
    try {
      identifierId = await resolve(true);
    } catch (error) {
      if (!(error instanceof ConcurrentIdentityLink)) throw error;
      identifierId = await resolve(false);
    }
    process.stdout.write(`${signPatientAssertion(key, { channelId, identifierId, actorRef: actor })}\n`);
  } finally {
    await prisma.onApplicationShutdown();
  }
}

void main().catch(() => {
  console.error('No se pudo aprovisionar la identidad ficticia. Revisa el canal, la evidencia y la configuración local.');
  process.exitCode = 1;
});
