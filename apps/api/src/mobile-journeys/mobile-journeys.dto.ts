import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { Equals, IsDefined, IsIn, IsInt, IsISO8601, IsObject, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf, ValidateNested } from 'class-validator';

const provided = (_object: unknown, value: unknown) => value !== undefined;
export const journeyStatuses = ['DRAFT', 'IN_PROGRESS', 'PENDING_CONFIRMATION', 'COMPLETED', 'CANCELLED'] as const;
export const journeySteps = ['SELECT_STUDY', 'SELECT_CLINIC', 'SELECT_DATETIME', 'REVIEW', 'CONFIRMED'] as const;
const eventTypes = ['JOURNEY_CONTEXT_UPDATED', 'JOURNEY_STATUS_CHANGED'] as const;
const targetStatuses = ['PENDING_CONFIRMATION', 'CANCELLED'] as const;
export const cursorFormat = /^[A-Za-z0-9_-]{1,200}(?![\s\S])/;
const eventIdFormat = /^(?!system:)[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}(?![\s\S])/;

export class CreateMobileJourneyDto {
  @ApiProperty({ enum: ['APPOINTMENT'] })
  @Equals('APPOINTMENT')
  type!: 'APPOINTMENT';
}

class MobileEventPayloadDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  expectedVersion!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(provided)
  @IsUUID()
  studyId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(provided)
  @IsUUID()
  clinicId?: string;

  @ApiPropertyOptional({ enum: targetStatuses })
  @ValidateIf(provided)
  @IsIn(targetStatuses)
  to?: typeof targetStatuses[number];
}

export class PublishMobileEventDto {
  @ApiProperty({ maxLength: 128, pattern: eventIdFormat.source, example: 'demo-study-01' })
  @IsString()
  @Matches(eventIdFormat)
  externalEventId!: string;

  @ApiProperty({ enum: eventTypes })
  @IsIn(eventTypes)
  type!: typeof eventTypes[number];

  @ApiProperty({ type: 'integer', enum: [1] })
  @Equals(1)
  schemaVersion!: 1;

  @ApiProperty({ format: 'date-time', example: '2026-11-24T06:31:00.000Z' })
  @IsISO8601({ strict: true })
  @Length(24, 24)
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  occurredAt!: string;

  @ApiProperty({ type: MobileEventPayloadDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => MobileEventPayloadDto)
  payload!: MobileEventPayloadDto;
}

export class MobileHistoryQueryDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, default: 20 })
  @Transform(({ value }) => typeof value === 'string' && /^[1-9]\d{0,2}(?![\s\S])/.test(value) ? Number(value) : value)
  @ValidateIf(provided)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ maxLength: 200, pattern: cursorFormat.source })
  @ValidateIf(provided)
  @IsString()
  @Matches(cursorFormat)
  cursor?: string;
}

export class MobileJourneyCreatedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: journeyStatuses })
  status!: string;
}

export class MobileJourneySummaryDto extends MobileJourneyCreatedDto {
  @ApiProperty({ type: String, example: 'APPOINTMENT' })
  type!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class MobileJourneyListDto {
  @ApiProperty({ type: [MobileJourneySummaryDto] })
  items!: MobileJourneySummaryDto[];
}

class MobileExternalRefsDto {
  @ApiPropertyOptional({ format: 'uuid' })
  appointmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  clinicId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  studyId?: string;
}

export class MobileJourneyContextDto {
  @ApiProperty({ format: 'uuid' })
  journeyId!: string;

  @ApiProperty()
  currentStep!: string;

  @ApiProperty({ type: 'integer', minimum: 1 })
  version!: number;

  @ApiProperty({ type: MobileExternalRefsDto })
  externalRefs!: MobileExternalRefsDto;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

class MobileHistoryDataDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1 })
  version?: number;

  @ApiPropertyOptional({ enum: journeySteps })
  currentStep?: string;

  @ApiPropertyOptional({ enum: journeyStatuses })
  from?: string;

  @ApiPropertyOptional({ enum: journeyStatuses })
  to?: string;
}

class MobileHistoryItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  producerCode!: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ format: 'date-time' })
  receivedAt!: string;

  @ApiProperty({ type: 'integer', minimum: 1 })
  schemaVersion!: number;

  @ApiProperty({ type: MobileHistoryDataDto })
  data!: MobileHistoryDataDto;
}

export class MobileJourneyHistoryDto {
  @ApiProperty({ type: [MobileHistoryItemDto] })
  items!: MobileHistoryItemDto[];

  @ApiPropertyOptional({ maxLength: 200 })
  nextCursor?: string;
}

export class MobileEventReceiptDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  journeyId!: string;
}
