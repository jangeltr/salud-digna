import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ChannelRequest } from '../channel-auth/channel-auth.guard';
import { PrismaService } from '../persistence/prisma.service';
import { verifyInstitutionalAssertion } from './institutional-assertion';

export const customerNamespace = 'salud-digna:institutional-customer';
const centralNamespace = 'salud-digna:central-customer:v1';
const assertionPurpose = 'salud-digna:demo-patient-assertion:v1\0';
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/;
export const opaqueRef = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

interface PatientAssertion {
  channelId: string;
  identifierId: string;
  actorRef: string;
  exp: number;
}

export interface ResolvedPatient {
  patientSubjectId: string;
  actorRef: string;
  expiresAt?: Date;
}

class ConcurrentCentralLink extends Error {}

export function readIdentityKey(value = process.env.ORCHESTRATOR_PATIENT_IDENTITY_KEY): Buffer {
  if (!value || !/^[\w-]{43}$/.test(value)) throw new ServiceUnavailableException();
  const key = Buffer.from(value, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== value) throw new ServiceUnavailableException();
  return key;
}

export function digestCustomerId(key: Uint8Array, customerId: string, namespace = customerNamespace): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(createHmac('sha256', key)
    .update(JSON.stringify(['CUSTOMER_ID', namespace, customerId])).digest());
}

function signature(key: Uint8Array, encoded: string): Buffer {
  return createHmac('sha256', key).update(assertionPurpose).update(encoded).digest();
}

export function signPatientAssertion(key: Uint8Array, input: Omit<PatientAssertion, 'exp'>): string {
  const exp = Math.floor(Date.now() / 1000) + 300;
  const encoded = Buffer.from(JSON.stringify({ ...input, exp })).toString('base64url');
  return `${encoded}.${signature(key, encoded).toString('base64url')}`;
}

function readAssertion(request: ChannelRequest, channelId: string): PatientAssertion {
  const raw = request.headers['x-patient-assertion'];
  if (typeof raw !== 'string' || raw.length > 768 || (request.headersDistinct?.['x-patient-assertion']?.length ?? 0) > 1) {
    throw new NotFoundException();
  }
  const match = /^([\w-]+)\.([\w-]{43})$/.exec(raw);
  if (!match || match[0] !== raw) throw new NotFoundException();
  const [, encoded, encodedSignature] = match;
  const supplied = Buffer.from(encodedSignature, 'base64url');
  if (supplied.toString('base64url') !== encodedSignature ||
      !timingSafeEqual(supplied, signature(readIdentityKey(), encoded))) throw new NotFoundException();

  // Only signed content reaches parsing. The local issuer produces this closed shape.
  let claim: PatientAssertion;
  try {
    claim = JSON.parse(Buffer.from(encoded, 'base64url').toString());
  } catch {
    throw new NotFoundException();
  }
  if (!claim || typeof claim !== 'object' || claim.channelId !== channelId ||
      typeof claim.identifierId !== 'string' || claim.identifierId.length !== 36 ||
      !uuid.test(claim.identifierId) || typeof claim.actorRef !== 'string' ||
      !opaqueRef.test(claim.actorRef) || claim.actorRef.trim() !== claim.actorRef ||
      !Number.isSafeInteger(claim.exp) || claim.exp <= Math.floor(Date.now() / 1000)) throw new NotFoundException();
  return claim;
}

@Injectable()
export class PatientIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(request: ChannelRequest, channelId: string, provision = false): Promise<ResolvedPatient> {
    const raw = request.headers['x-patient-assertion'];
    if (typeof raw === 'string' && raw.split('.').length === 3) return this.resolveCentral(request, provision);
    const claim = readAssertion(request, channelId);
    const identifier = await this.prisma.client.patientIdentifier.findUnique({
      where: {
        id: claim.identifierId, namespace: customerNamespace, type: 'CUSTOMER_ID', status: 'VERIFIED',
        verifiedLookupDigest: { not: null }, revokedAt: null,
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
      select: { patientSubjectId: true },
    });
    if (!identifier) throw new NotFoundException();
    return { patientSubjectId: identifier.patientSubjectId, actorRef: claim.actorRef };
  }

  async resolveCentral(request: ChannelRequest, provision = false) {
    const channel = request.authenticatedChannel;
    const raw = request.headers['x-patient-assertion'];
    if (!channel || typeof raw !== 'string' || (request.headersDistinct?.['x-patient-assertion']?.length ?? 0) > 1) {
      throw new NotFoundException();
    }
    const assertion = verifyInstitutionalAssertion(raw, channel.code);
    const digest = digestCustomerId(readIdentityKey(), assertion.customerId, centralNamespace);
    const key = { type: 'CUSTOMER_ID' as const, namespace: centralNamespace, verifiedLookupDigest: digest };
    const where = { type_namespace_verifiedLookupDigest: key };
    const select = { patientSubjectId: true, status: true, revokedAt: true, validUntil: true } as const;
    const checkedSubject = (row: {
      patientSubjectId: string; status: string; revokedAt: Date | null; validUntil: Date | null;
    } | null) => {
      const now = new Date();
      if (!row || row.status !== 'VERIFIED' || row.revokedAt || (row.validUntil && row.validUntil <= now) ||
          assertion.expiresAt <= now) throw new NotFoundException();
      return {
        patientSubjectId: row.patientSubjectId, actorRef: assertion.actorRef,
        expiresAt: row.validUntil && row.validUntil < assertion.expiresAt ? row.validUntil : assertion.expiresAt,
      };
    };

    const current = await this.prisma.client.patientIdentifier.findUnique({ where, select });
    if (current || !provision) return checkedSubject(current);

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        if (await tx.patientIdentifier.findFirst({
          where: { type: key.type, namespace: key.namespace, lookupDigest: digest }, select: { id: true },
        })) throw new ConcurrentCentralLink();
        const now = new Date();
        if (assertion.expiresAt <= now) throw new NotFoundException();
        const subject = await tx.patientSubject.create({ data: {}, select: { id: true } });
        const inserted = await tx.patientIdentifier.createMany({
          data: {
            ...key, lookupDigest: digest, patientSubjectId: subject.id, sourceChannelId: channel.id,
            status: 'VERIFIED', verificationMethod: 'CENTRAL_SIGNED', verificationRef: assertion.verificationRef,
            createdAt: now, verifiedAt: now,
          },
          skipDuplicates: true,
        });
        if (!inserted.count) throw new ConcurrentCentralLink();
        await tx.accessAudit.create({
          data: {
            patientSubjectId: subject.id, channelId: channel.id, actorRef: assertion.actorRef,
            action: 'VERIFY_IDENTIFIER', outcome: 'ALLOWED', reasonCode: 'CENTRAL_SIGNED_CUSTOMER_ID',
          },
          select: { id: true },
        });
        return checkedSubject({ patientSubjectId: subject.id, status: 'VERIFIED', revokedAt: null, validUntil: null });
      });
    } catch (error) {
      if (!(error instanceof ConcurrentCentralLink)) throw error;
      return checkedSubject(await this.prisma.client.patientIdentifier.findUnique({ where, select }));
    }
  }
}
