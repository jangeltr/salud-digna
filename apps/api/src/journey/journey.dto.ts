import { ApiProperty } from '@nestjs/swagger';
import { Channel, UserRole } from '../generated/prisma/enums';

export const JOURNEY_TYPES = [
  'REQUEST_CREATED', 'REQUEST_CONTEXT_UPDATED', 'REQUEST_PAUSED', 'REQUEST_RESUMED',
  'CHANNEL_SWITCHED', 'REQUEST_STATUS_CHANGED', 'APPOINTMENT_CONFIRMED',
];

export class JourneyEntryDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000009' })
  id!: string;

  @ApiProperty({ enum: JOURNEY_TYPES, example: 'APPOINTMENT_CONFIRMED' })
  type!: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-21T19:10:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ enum: Channel, enumName: 'Channel', example: Channel.CALL_CENTER })
  channel!: Channel;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole', nullable: true, example: UserRole.ADVISOR })
  actorRole!: UserRole | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
    example: { appointmentId: '00000000-0000-4000-8000-000000000004', version: 3 },
  })
  payload!: Record<string, string | number>;
}
