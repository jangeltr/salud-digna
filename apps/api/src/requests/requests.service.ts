import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { Channel, ServiceRequestStatus, ServiceRequestType, UserRole } from '../generated/prisma/enums';
import { IdentityService } from '../identity/identity.service';
import { PrismaService } from '../persistence/prisma.service';
import type { RequestPageDto, RequestPaginationDto, RequestSnapshotDto, UpdateRequestContextDto } from './requests.dto';
import { advanceWorkflow, OPEN_REQUEST_STATUSES, RequestStep, type RequestContextData } from './request-workflow';

export type RequestOrigin =
  | { channel: typeof Channel.WEB; patientId: string; actorUserId: string }
  | { channel: typeof Channel.WHATSAPP; externalId: string };

type RequestActor = { patientId: string; channel: Channel; actorUserId: string };
type RequestEvent = Pick<Prisma.DomainEventCreateManyInput, 'type' | 'payload'>;

const includeContext = { context: { select: { data: true } } } satisfies Prisma.ServiceRequestInclude;
type StoredRequest = Prisma.ServiceRequestGetPayload<{ include: typeof includeContext }>;

function snapshot(row: StoredRequest): RequestSnapshotDto {
  const { patientId: _patientId, context, ...request } = row;
  const data = context?.data;
  const publicContext: RequestContextData = {};
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const key of ['studyId', 'clinicId', 'scheduledAt', 'notes'] as const) {
      if (typeof data[key] === 'string') publicContext[key] = data[key];
    }
  }
  return { ...request, context: publicContext };
}

function versionConflict(): ConflictException {
  return new ConflictException('La versión cambió. Recupera el estado actualizado de la solicitud.');
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  async create(origin: RequestOrigin): Promise<RequestSnapshotDto> {
    const actor = await this.authorize(origin);
    return this.prisma.client.$transaction(async (tx) => {
      const request = await tx.serviceRequest.create({
        data: {
          patientId: actor.patientId,
          type: ServiceRequestType.APPOINTMENT,
          status: ServiceRequestStatus.DRAFT,
          currentStep: RequestStep.SELECT_STUDY,
          lastChannel: actor.channel,
          version: 1,
          context: { create: { data: {} } },
        },
        include: includeContext,
      });
      await this.recordEvents(tx, actor, request.id, [
        { type: 'REQUEST_CREATED', payload: { version: request.version } },
      ]);
      return snapshot(request);
    });
  }

  async list(
    origin: RequestOrigin,
    { page, limit }: RequestPaginationDto,
    status?: ServiceRequestStatus,
    pending = false,
  ): Promise<RequestPageDto> {
    const actor = await this.authorize(origin);
    const rows = await this.prisma.client.$transaction((tx) => tx.serviceRequest.findMany({
      where: {
        patientId: actor.patientId,
        status: pending ? { in: OPEN_REQUEST_STATUSES } : status,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit + 1,
      include: includeContext,
    }), { isolationLevel: 'RepeatableRead' });
    return { items: rows.slice(0, limit).map(snapshot), page, limit, hasMore: rows.length > limit };
  }

  async get(origin: RequestOrigin, id: string): Promise<RequestSnapshotDto> {
    const actor = await this.authorize(origin);
    return this.prisma.client.$transaction(async (tx) => {
      return snapshot(await this.findOwn(tx, actor.patientId, id));
    }, { isolationLevel: 'RepeatableRead' });
  }

  async updateContext(origin: RequestOrigin, id: string, input: UpdateRequestContextDto): Promise<RequestSnapshotDto> {
    const actor = await this.authorize(origin);
    const { version, ...patch } = input;
    return this.prisma.client.$transaction(async (tx) => {
      const current = await this.findOwn(tx, actor.patientId, id);
      await this.claim(tx, current, version, true);
      const next = advanceWorkflow(snapshot(current).context, patch);

      if (next.context.studyId && !await tx.study.findFirst({
        where: { id: next.context.studyId, isActive: true }, select: { id: true },
      })) {
        throw new BadRequestException('Selecciona un estudio activo.');
      }
      if (next.context.clinicId && !await tx.clinic.findFirst({
        where: { id: next.context.clinicId, isActive: true }, select: { id: true },
      })) {
        throw new BadRequestException('Selecciona una clínica activa.');
      }

      const data = { ...next.context };
      await tx.requestContext.upsert({
        where: { requestId: id },
        create: { requestId: id, data },
        update: { data },
      });
      const updated = await tx.serviceRequest.update({
        where: { id },
        data: { status: next.status, currentStep: next.currentStep, lastChannel: actor.channel },
        include: includeContext,
      });

      const events: RequestEvent[] = [
        { type: 'REQUEST_CONTEXT_UPDATED', payload: { version: updated.version, currentStep: updated.currentStep } },
      ];
      if (current.status !== updated.status) {
        events.push({
          type: 'REQUEST_STATUS_CHANGED',
          payload: { from: current.status, to: updated.status, version: updated.version },
        });
      }
      events.push(...this.channelEvents(current.lastChannel, actor.channel, updated.version));
      await this.recordEvents(tx, actor, id, events);
      return snapshot(updated);
    }, { isolationLevel: 'ReadCommitted' });
  }

  async recordActivity(
    origin: RequestOrigin,
    id: string,
    version: number,
    action: 'REQUEST_PAUSED' | 'REQUEST_RESUMED',
  ): Promise<RequestSnapshotDto> {
    const actor = await this.authorize(origin);
    return this.prisma.client.$transaction(async (tx) => {
      const current = await this.findOwn(tx, actor.patientId, id);
      const switched = current.lastChannel !== actor.channel;
      await this.claim(tx, current, version, switched || action === 'REQUEST_PAUSED', actor.channel);
      const updated = await this.findOwn(tx, actor.patientId, id);
      await this.recordEvents(tx, actor, id, [
        { type: action, payload: { from: current.lastChannel, to: actor.channel, version: updated.version } },
        ...this.channelEvents(current.lastChannel, actor.channel, updated.version),
      ]);
      await tx.interaction.create({
        data: { requestId: id, ...actor, type: action },
      });
      return snapshot(updated);
    }, { isolationLevel: 'ReadCommitted' });
  }

  private async authorize(origin: RequestOrigin): Promise<RequestActor> {
    if (origin.channel === Channel.WEB) return origin;

    const identity = await this.identity.resolveVerifiedIdentity(Channel.WHATSAPP, origin.externalId);
    if (identity.status !== 'VERIFIED') {
      throw new ForbiddenException('El canal requiere una identidad verificada.');
    }
    const account = await this.prisma.client.user.findUnique({
      where: { patientId: identity.patientId, isActive: true, role: UserRole.PATIENT },
      select: { id: true },
    });
    if (!account) throw new ForbiddenException('El canal requiere una cuenta de paciente activa.');

    return { channel: Channel.WHATSAPP, patientId: identity.patientId, actorUserId: account.id };
  }

  private async findOwn(tx: Prisma.TransactionClient, patientId: string, id: string): Promise<StoredRequest> {
    const request = await tx.serviceRequest.findUnique({
      where: { id, patientId }, include: includeContext,
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada.');
    return request;
  }

  private async claim(
    tx: Prisma.TransactionClient,
    current: StoredRequest,
    version: number,
    change: boolean,
    lastChannel?: Channel,
  ): Promise<void> {
    if (current.version !== version) throw versionConflict();
    if (!OPEN_REQUEST_STATUSES.includes(current.status)) {
      throw new ConflictException('La solicitud está cerrada y no puede modificarse.');
    }

    const result = await tx.serviceRequest.updateMany({
      where: {
        id: current.id, patientId: current.patientId, version, status: { in: OPEN_REQUEST_STATUSES },
      },
      // La reanudación en el mismo canal reserva la versión durante la transacción sin alterar la fila.
      data: change ? { version: { increment: 1 }, lastChannel } : { updatedAt: current.updatedAt },
    });
    if (!result.count) throw versionConflict();
  }

  private channelEvents(from: Channel, to: Channel, version: number): RequestEvent[] {
    return from === to ? [] : [{ type: 'CHANNEL_SWITCHED', payload: { from, to, version } }];
  }

  private async recordEvents(
    tx: Prisma.TransactionClient,
    actor: RequestActor,
    requestId: string,
    events: RequestEvent[],
  ): Promise<void> {
    await tx.domainEvent.createMany({ data: events.map((event) => ({ ...event, ...actor, requestId })) });
  }
}
