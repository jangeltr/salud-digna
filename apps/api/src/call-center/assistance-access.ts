import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

export function activeAssistance(advisorId: string, now = new Date()): Prisma.AssistanceAuthorizationWhereInput {
  return { advisorId, claimedAt: { not: null }, accessExpiresAt: { gt: now } };
}

export async function requireAssistance(tx: Prisma.TransactionClient, advisorId: string, requestId: string) {
  const request = await tx.serviceRequest.findUnique({
    where: { id: requestId, assistanceAuthorizations: { some: activeAssistance(advisorId) } },
    select: { patientId: true },
  });
  if (!request) throw new NotFoundException('Solicitud no encontrada.');
  return request.patientId;
}
