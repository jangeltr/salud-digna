import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { Channel } from '../generated/prisma/enums';
import { PrismaService } from '../persistence/prisma.service';
import type { IdentityLinkCodeDto, LinkedIdentityDto } from './identity.dto';

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const SIMULATION_PREFIX = 'sim:';

const identityFields = {
  id: true, provider: true, externalId: true, verifiedAt: true,
} satisfies Prisma.PatientIdentitySelect;

export interface IdentityPatient {
  id: string;
  patientId: string;
}

type LinkProof = {
  provider: Channel;
  externalId: string;
} & (
  | { source: 'TRUSTED' }
  | { source: 'SIMULATED'; actor: IdentityPatient }
);

type Resolution =
  | { status: 'UNKNOWN' | 'UNVERIFIED' }
  | { status: 'VERIFIED'; patientId: string };

function normalizeExternalId(provider: Channel, value: string): string {
  const trimmed = value.trim();
  if (provider === Channel.WHATSAPP) {
    const phone = trimmed.replace(/[ ().-]/g, '');
    if (/^\+[1-9][0-9]{1,14}$/.test(phone)) return phone;
  } else if (/^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/.test(trimmed)) {
    return trimmed;
  }

  throw new BadRequestException('Identificador de canal inválido.');
}

function hashCode(code: string): Buffer {
  return createHash('sha256').update(code).digest();
}

function toPublicIdentity(
  identity: Prisma.PatientIdentityGetPayload<{ select: typeof identityFields }>,
): LinkedIdentityDto {
  return { ...identity, simulated: identity.externalId.startsWith(SIMULATION_PREFIX) };
}

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async listOwnIdentities(patientId: string): Promise<LinkedIdentityDto[]> {
    const identities = await this.prisma.client.patientIdentity.findMany({
      where: { patientId },
      select: identityFields,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return identities.map(toPublicIdentity);
  }

  async requestLink(actor: IdentityPatient, provider: Channel): Promise<IdentityLinkCodeDto> {
    const code = randomBytes(16).toString('base64url');
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    const linkId = await this.prisma.client.$transaction(async (tx) => {
      const link = await tx.identityLink.create({
        data: { provider, patientId: actor.patientId, codeHash: hashCode(code).toString('hex'), expiresAt },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'IDENTITY_LINK_REQUESTED',
          entityType: 'IdentityLink',
          entityId: link.id,
          metadata: { provider },
        },
      });
      return link.id;
    });

    return { linkId, code, expiresAt };
  }

  // El adaptador aporta este identificador después de comprobar su procedencia.
  linkTrustedIdentity(provider: Channel, externalId: string, linkId: string, code: string) {
    return this.completeLink({ source: 'TRUSTED', provider, externalId }, linkId, hashCode(code));
  }

  linkTrustedIdentityByDigest(provider: Channel, externalId: string, linkId: string, digest: string) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new BadRequestException('Código de vinculación no válido.');
    return this.completeLink({ source: 'TRUSTED', provider, externalId }, linkId, Buffer.from(digest, 'hex'));
  }

  linkSimulatedIdentity(actor: IdentityPatient, provider: Channel, fixture: string, linkId: string, code: string) {
    return this.completeLink({ source: 'SIMULATED', actor, provider, externalId: fixture }, linkId, hashCode(code));
  }

  async resolveVerifiedIdentity(provider: Channel, externalId: string): Promise<Resolution> {
    const identity = await this.prisma.client.patientIdentity.findUnique({
      where: { provider_externalId: { provider, externalId: normalizeExternalId(provider, externalId) } },
      select: { patientId: true, verifiedAt: true },
    });
    if (!identity) return { status: 'UNKNOWN' };
    if (!identity.verifiedAt) return { status: 'UNVERIFIED' };
    return { status: 'VERIFIED', patientId: identity.patientId };
  }

  private async completeLink(proof: LinkProof, linkId: string, codeDigest: Buffer): Promise<LinkedIdentityDto> {
    const { provider, source } = proof;
    const normalized = normalizeExternalId(provider, proof.externalId);
    const simulated = source === 'SIMULATED';
    const externalId = simulated ? SIMULATION_PREFIX + normalized : normalized;
    const actor = simulated ? proof.actor : undefined;

    const outcome = await this.prisma.client.$transaction(async (tx) => {
      const link = await tx.identityLink.findUnique({
        where: { id: linkId, provider, patientId: actor?.patientId },
        select: { patientId: true, codeHash: true },
      });
      if (!link) return { status: 'INVALID' } as const;

      const matches = timingSafeEqual(codeDigest, Buffer.from(link.codeHash, 'hex'));
      const now = new Date();
      const claimed = await tx.identityLink.updateMany({
        where: { id: linkId, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 }, ...(matches && { consumedAt: now }) },
      });
      if (!claimed.count) return { status: 'INVALID' } as const;

      if (!matches) {
        await this.auditRejection(tx, linkId, provider, source, 'INVALID_CODE', actor?.id);
        return { status: 'INVALID' } as const;
      }

      // La unicidad del par protege la titularidad incluso con códigos distintos y concurrentes.
      await tx.patientIdentity.createMany({
        data: { provider, externalId, patientId: link.patientId },
        skipDuplicates: true,
      });
      const identity = await tx.patientIdentity.findUniqueOrThrow({
        where: { provider_externalId: { provider, externalId } },
        select: { ...identityFields, patientId: true },
      });
      if (identity.patientId !== link.patientId) {
        await this.auditRejection(tx, linkId, provider, source, 'IDENTITY_ALREADY_LINKED', actor?.id);
        return { status: 'CONFLICT' } as const;
      }

      const verified = !simulated && !identity.verifiedAt
        ? await tx.patientIdentity.updateMany({
          where: { id: identity.id, verifiedAt: null },
          data: { verifiedAt: now },
        })
        : { count: 0 };

      const auditData = {
        actorUserId: actor?.id,
        entityType: 'PatientIdentity',
        entityId: identity.id,
        metadata: { provider, source },
      };
      await tx.auditLog.createMany({
        data: [
          { ...auditData, action: 'IDENTITY_LINKED' },
          ...(verified.count ? [{ ...auditData, action: 'IDENTITY_VERIFIED' }] : []),
        ],
      });

      const current = !simulated && !identity.verifiedAt
        ? await tx.patientIdentity.findUniqueOrThrow({ where: { id: identity.id }, select: identityFields })
        : identity;
      return {
        status: 'LINKED',
        identity: toPublicIdentity({
          id: current.id, provider, externalId, verifiedAt: current.verifiedAt,
        }),
      } as const;
    }, { isolationLevel: 'ReadCommitted' });

    if (outcome.status === 'CONFLICT') throw new ConflictException('La identidad no está disponible para vinculación.');
    if (outcome.status === 'INVALID') throw new BadRequestException('Código de vinculación no válido.');
    return outcome.identity;
  }

  private async auditRejection(
    tx: Prisma.TransactionClient,
    linkId: string,
    provider: Channel,
    source: LinkProof['source'],
    reason: 'INVALID_CODE' | 'IDENTITY_ALREADY_LINKED',
    actorUserId?: string,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: 'IDENTITY_LINK_REJECTED',
        entityType: 'IdentityLink',
        entityId: linkId,
        metadata: { provider, source, reason },
      },
    });
  }
}
