import {
  BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey, randomUUID, sign, timingSafeEqual, verify, type KeyObject } from 'node:crypto';
import { isUUID } from 'class-validator';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../persistence/prisma.service';
import type { AccountDto } from './auth.dto';

const issuer = 'https://api.salud-digna.app';
const audience = 'https://orchestrator.salud-digna.app';
const assertionType = 'sd-patient+jwt';
const consentType = 'sd-patient-consent+jwt';
const consentAudience = 'https://api.salud-digna.app/api/v1/auth/patient-assertions';
const maxAge = 300;

type PatientChannelRole = typeof UserRole.PATIENT | typeof UserRole.ADVISOR;
export interface PatientAssertionChannel { code: string; role: PatientChannelRole }
interface ChannelCredential extends PatientAssertionChannel { digest: Buffer }
interface IssuerConfig { privateKey: KeyObject; publicKey: KeyObject; channels: ChannelCredential[] }
interface ConsentClaims { patientId: string; advisorId: string; channel: string; exp: number }

function readConfig(): IssuerConfig {
  const pem = process.env.PATIENT_ASSERTION_PRIVATE_KEY?.trim();
  if (!pem?.startsWith('-----BEGIN PRIVATE KEY-----\n') || !pem.endsWith('-----END PRIVATE KEY-----')) throw new Error();
  const privateKey = createPrivateKey(pem);
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error();
  const entries: unknown = JSON.parse(process.env.PATIENT_ASSERTION_CHANNELS ?? '');
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error();
  const digests = new Set<string>();
  const channels = Object.entries(entries).map(([code, value]): ChannelCredential => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/.test(code) || code.trim() !== code ||
        !value || typeof value !== 'object') throw new Error();
    const { role, secretDigest } = value;
    if ((role !== UserRole.PATIENT && role !== UserRole.ADVISOR) ||
        typeof secretDigest !== 'string' || secretDigest.length !== 64 ||
        !/^[\da-f]{64}$/.test(secretDigest) || digests.has(secretDigest)) throw new Error();
    digests.add(secretDigest);
    return { code, role, digest: Buffer.from(secretDigest, 'hex') };
  });
  if (!channels.length) throw new Error();
  return { privateKey, publicKey: createPublicKey(privateKey), channels };
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signedToken(key: KeyObject, typ: string, claims: object): string {
  const input = `${encode({ alg: 'EdDSA', typ })}.${encode(claims)}`;
  return `${input}.${sign(null, Buffer.from(input), key).toString('base64url')}`;
}

function expiresAt(sessionExpiresAt: number, now: number, authorizationExpiresAt = Infinity): number {
  if (!Number.isSafeInteger(sessionExpiresAt) || sessionExpiresAt <= now) throw new UnauthorizedException();
  return Math.min(sessionExpiresAt, now + maxAge, authorizationExpiresAt);
}

function readConsent(raw: string, publicKey: KeyObject, advisorId: string, channel: string, now: number): ConsentClaims {
  try {
    if (raw.length > 2048 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(raw)) throw new Error();
    const [header, payload, encodedSignature] = raw.split('.');
    const signature = Buffer.from(encodedSignature, 'base64url');
    if (header !== encode({ alg: 'EdDSA', typ: consentType }) || signature.length !== 64 ||
        signature.toString('base64url') !== encodedSignature ||
        !verify(null, Buffer.from(`${header}.${payload}`), publicKey, signature)) throw new Error();
    const { iss, aud, iat, exp, patientId, advisorId: recipient, channel: destination } =
      JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (iss !== issuer || aud !== consentAudience || recipient !== advisorId || destination !== channel ||
        typeof patientId !== 'string' || !isUUID(patientId) || !Number.isSafeInteger(iat) ||
        !Number.isSafeInteger(exp) || iat > now || exp <= now || exp - iat > maxAge) throw new Error();
    return { patientId, advisorId, channel, exp };
  } catch {
    throw new ForbiddenException();
  }
}

@Injectable()
export class PatientAssertionsService {
  private configuration?: IssuerConfig;

  constructor(private readonly prisma: PrismaService) {}

  authenticate(raw: unknown): PatientAssertionChannel {
    if (typeof raw !== 'string' || raw.length !== 43 || !/^[\w-]{43}$/.test(raw)) throw new UnauthorizedException();
    const secret = Buffer.from(raw, 'base64url');
    if (secret.length !== 32 || secret.toString('base64url') !== raw) throw new UnauthorizedException();
    const digest = createHash('sha256').update(secret).digest();
    const channel = this.config().channels.find((entry) => timingSafeEqual(entry.digest, digest));
    if (!channel) throw new UnauthorizedException();
    return { code: channel.code, role: channel.role };
  }

  async issue(user: AccountDto, channel: PatientAssertionChannel, sessionExpiresAt: number, consent?: string) {
    if (user.role !== channel.role) throw new ForbiddenException();
    const { privateKey, publicKey } = this.config();
    let customerId = user.patientId;
    let authorizationExpiresAt = Infinity;
    if (channel.role === UserRole.ADVISOR) {
      if (!consent) throw new ForbiddenException();
      const authorization = readConsent(consent, publicKey, user.id, channel.code, Math.floor(Date.now() / 1000));
      const patientAccount = await this.prisma.client.user.findUnique({
        where: { patientId: authorization.patientId, isActive: true, role: UserRole.PATIENT },
        select: { patientId: true },
      });
      customerId = patientAccount?.patientId ?? null;
      authorizationExpiresAt = authorization.exp;
    } else if (consent !== undefined) {
      throw new BadRequestException();
    }
    const iat = Math.floor(Date.now() / 1000);
    if (!customerId || !isUUID(customerId) || authorizationExpiresAt <= iat) throw new ForbiddenException();
    const exp = expiresAt(sessionExpiresAt, iat, authorizationExpiresAt);
    return { assertion: signedToken(privateKey, assertionType, {
      iss: issuer, aud: audience, channel: channel.code, scope: 'journeys:patient',
      customerId, sub: user.id, jti: randomUUID(), iat, exp,
    }) };
  }

  async consent(user: AccountDto, source: PatientAssertionChannel, sessionExpiresAt: number, advisorId: string, channel: string) {
    if (user.role !== UserRole.PATIENT || source.role !== UserRole.PATIENT || !user.patientId) throw new ForbiddenException();
    const { channels, privateKey } = this.config();
    if (!channels.some((entry) => entry.code === channel && entry.role === UserRole.ADVISOR)) throw new ForbiddenException();
    const advisor = await this.prisma.client.user.findUnique({
      where: { id: advisorId, role: UserRole.ADVISOR, isActive: true },
      select: { id: true },
    });
    if (!advisor) throw new ForbiddenException();
    const iat = Math.floor(Date.now() / 1000);
    const exp = expiresAt(sessionExpiresAt, iat);
    return { consent: signedToken(privateKey, consentType, {
      iss: issuer, aud: consentAudience, patientId: user.patientId, advisorId: advisor.id, channel, iat, exp,
    }) };
  }

  private config(): IssuerConfig {
    try {
      return this.configuration ??= readConfig();
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
