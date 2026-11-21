import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AppointmentsService } from '../appointments/appointments.service';
import { Channel } from '../generated/prisma/enums';
import { JourneyService } from '../journey/journey.service';
import { PrismaService } from '../persistence/prisma.service';
import type { WebRequestOrigin } from '../requests/request-origin';
import { OPEN_REQUEST_STATUSES } from '../requests/request-workflow';
import { RequestsService } from '../requests/requests.service';
import { requireAssistance } from './assistance-access';
import type { AssistanceCodeDto, AssistanceGrantDto, AssistedRequestDto } from './call-center.dto';

const MINUTE_MS = 60_000;

function codeDigest(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

@Injectable()
export class CallCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requests: RequestsService,
    private readonly appointments: AppointmentsService,
    private readonly journey: JourneyService,
  ) {}

  async issue(actor: WebRequestOrigin, requestId: string): Promise<AssistanceCodeDto> {
    const code = randomBytes(16).toString('base64url');
    const expiresAt = new Date(Date.now() + 5 * MINUTE_MS);
    await this.prisma.client.$transaction(async (tx) => {
      const request = await tx.serviceRequest.findUnique({
        where: { id: requestId, patientId: actor.patientId }, select: { status: true },
      });
      if (!request) throw new NotFoundException('Solicitud no encontrada.');
      if (!OPEN_REQUEST_STATUSES.includes(request.status)) throw new ConflictException('La solicitud está cerrada.');

      await tx.assistanceAuthorization.create({
        data: { requestId, codeHash: codeDigest(code), codeExpiresAt: expiresAt },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: { actorUserId: actor.actorUserId, action: 'ASSISTANCE_CODE_ISSUED', entityType: 'ServiceRequest', entityId: requestId },
      });
    });
    return { code, expiresAt };
  }

  claim(advisorId: string, code: string): Promise<AssistanceGrantDto> {
    return this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * MINUTE_MS);
      const [authorization] = await tx.assistanceAuthorization.updateManyAndReturn({
        where: {
          codeHash: codeDigest(code), claimedAt: null, advisorId: null, codeExpiresAt: { gt: now },
          request: { status: { in: OPEN_REQUEST_STATUSES } },
        },
        data: { advisorId, claimedAt: now, accessExpiresAt: expiresAt },
        select: { requestId: true },
      });
      if (!authorization) throw new BadRequestException('Referencia de atención inválida o vencida.');

      const { requestId } = authorization;
      await tx.auditLog.create({
        data: {
          actorUserId: advisorId, action: 'ASSISTANCE_CLAIMED', entityType: 'ServiceRequest', entityId: requestId,
        },
      });
      return { requestId, expiresAt };
    });
  }

  getRequest(advisorId: string, requestId: string): Promise<AssistedRequestDto> {
    return this.prisma.client.$transaction(async (tx) => {
      const patientId = await requireAssistance(tx, advisorId, requestId);
      const snapshot = await this.requests.readSnapshot(tx, patientId, requestId);
      const patient = await tx.patient.findUniqueOrThrow({
        where: { id: patientId }, select: { firstName: true, lastName: true },
      });
      const { studyId, clinicId } = snapshot.context;
      const study = studyId && isUUID(studyId)
        ? await tx.study.findUnique({ where: { id: studyId }, select: { id: true, name: true } })
        : null;
      const clinic = clinicId && isUUID(clinicId)
        ? await tx.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } })
        : null;
      const recentEvents = await this.journey.timeline(tx, requestId, 10);
      return { ...snapshot, patient, study, clinic, recentEvents };
    }, { isolationLevel: 'RepeatableRead' });
  }

  confirm(advisorId: string, requestId: string, version: number) {
    return this.appointments.confirm({ channel: Channel.CALL_CENTER, actorUserId: advisorId }, requestId, version);
  }
}
