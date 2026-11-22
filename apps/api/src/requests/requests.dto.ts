import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsEnum, IsInt, IsISO8601, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Channel, ServiceRequestStatus, ServiceRequestType } from '../generated/prisma/enums';
import { RequestStep, SCHEDULE_WITH_TIME_ZONE } from './request-workflow';

const studyExample = '00000000-0000-4000-8000-000000000002';
const clinicExample = '00000000-0000-4000-8000-000000000003';
const scheduleExample = '2027-01-05T16:30:00.000Z';

export class CreateRequestDto {
  @ApiPropertyOptional({ enum: ServiceRequestType, default: ServiceRequestType.APPOINTMENT })
  @ValidateIf((_object, value) => value !== undefined)
  @Equals(ServiceRequestType.APPOINTMENT)
  type?: ServiceRequestType;
}

export class RequestVersionDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483647, example: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number;
}

export class UpdateRequestContextDto extends RequestVersionDto {
  @ApiPropertyOptional({ format: 'uuid', example: studyExample })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  @Transform(({ value }) => typeof value === 'string' ? value.toLowerCase() : value)
  studyId?: string;

  @ApiPropertyOptional({ format: 'uuid', example: clinicExample })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  @Transform(({ value }) => typeof value === 'string' ? value.toLowerCase() : value)
  clinicId?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, example: scheduleExample })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(SCHEDULE_WITH_TIME_ZONE)
  scheduledAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500, example: 'Prefiero el turno de la mañana.' })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

function queryInteger(value: unknown): unknown {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
}

export class RequestPaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 10000 })
  @Transform(({ value }) => queryInteger(value))
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Transform(({ value }) => queryInteger(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class ListRequestsDto extends RequestPaginationDto {
  @ApiPropertyOptional({ enum: ServiceRequestStatus, enumName: 'ServiceRequestStatus' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ServiceRequestStatus)
  status?: ServiceRequestStatus;
}

export class RequestContextDto {
  @ApiPropertyOptional({ format: 'uuid', example: studyExample })
  studyId?: string;

  @ApiPropertyOptional({ format: 'uuid', example: clinicExample })
  clinicId?: string;

  @ApiPropertyOptional({ format: 'date-time', example: scheduleExample })
  scheduledAt?: string;

  @ApiPropertyOptional({ maxLength: 500, example: 'Prefiero el turno de la mañana.' })
  notes?: string;
}

export class RequestSnapshotDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  id!: string;

  @ApiProperty({ enum: ServiceRequestType, example: ServiceRequestType.APPOINTMENT })
  type!: ServiceRequestType;

  @ApiProperty({ enum: ServiceRequestStatus, enumName: 'ServiceRequestStatus', example: ServiceRequestStatus.DRAFT })
  status!: ServiceRequestStatus;

  @ApiProperty({ enum: RequestStep, example: RequestStep.SELECT_STUDY })
  currentStep!: string;

  @ApiProperty({ enum: Channel, enumName: 'Channel', example: Channel.WEB })
  lastChannel!: Channel;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ type: RequestContextDto, example: {} })
  context!: RequestContextDto;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-11-21T19:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-11-21T19:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, example: null })
  completedAt!: Date | null;
}

export class RequestPageDto {
  @ApiProperty({ type: [RequestSnapshotDto] })
  items!: RequestSnapshotDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: false })
  hasMore!: boolean;
}
