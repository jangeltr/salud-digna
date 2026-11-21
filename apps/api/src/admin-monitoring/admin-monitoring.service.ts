import { Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, ServiceRequestStatus } from '../generated/prisma/enums';
import type { JourneyEntryDto } from '../journey/journey.dto';
import { JourneyService } from '../journey/journey.service';
import { PrismaService } from '../persistence/prisma.service';
import { OPEN_REQUEST_STATUSES } from '../requests/request-workflow';
import type { ListRequestsDto } from '../requests/requests.dto';
import type { AdminOverviewDto, AdminRequestPageDto } from './admin-monitoring.dto';

@Injectable()
export class AdminMonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journey: JourneyService,
  ) {}

  async overview(): Promise<AdminOverviewDto> {
    const client = this.prisma.client;
    const countsByStatus = client.serviceRequest.groupBy({ by: ['status'], _count: { _all: true } });
    const [totalPatients, groups, confirmedAppointments] = await client.$transaction([
      client.patient.count(),
      countsByStatus,
      client.appointment.count({ where: { status: AppointmentStatus.CONFIRMED } }),
    ], { isolationLevel: 'RepeatableRead' });
    const requestsByStatus: Record<ServiceRequestStatus, number> = {
      DRAFT: 0, IN_PROGRESS: 0, PENDING_CONFIRMATION: 0, COMPLETED: 0, CANCELLED: 0,
    };
    for (const group of groups) requestsByStatus[group.status] = group._count._all;

    return {
      totalPatients,
      requestsCreated: Object.values(requestsByStatus).reduce((total, count) => total + count, 0),
      openRequests: OPEN_REQUEST_STATUSES.reduce((total, status) => total + requestsByStatus[status], 0),
      completedRequests: requestsByStatus.COMPLETED,
      confirmedAppointments,
      requestsByStatus,
    };
  }

  async list({ page, limit, status }: ListRequestsDto): Promise<AdminRequestPageDto> {
    const rows = await this.prisma.client.serviceRequest.findMany({
      where: { status },
      select: { id: true, status: true, currentStep: true, lastChannel: true, createdAt: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit + 1,
    });
    return { items: rows.slice(0, limit), page, limit, hasMore: rows.length > limit };
  }

  readJourney(actorUserId: string, requestId: string): Promise<JourneyEntryDto[]> {
    return this.prisma.client.$transaction(async (tx) => {
      const request = await tx.serviceRequest.findUnique({ where: { id: requestId }, select: { id: true } });
      if (!request) throw new NotFoundException('Solicitud no encontrada.');
      const timeline = await this.journey.timeline(tx, requestId);
      await tx.auditLog.create({
        data: { actorUserId, action: 'ADMIN_JOURNEY_VIEWED', entityType: 'ServiceRequest', entityId: requestId },
      });
      return timeline;
    }, { isolationLevel: 'RepeatableRead' });
  }
}
