import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDefined, IsEnum, IsObject, IsString, IsUUID, Length, ValidateIf, ValidateNested } from 'class-validator';
import { ServiceRequestStatus } from '../generated/prisma/enums';
import { RequestStep } from '../requests/request-workflow';
import { RequestVersionDto } from '../requests/requests.dto';

export enum ConversationIntent {
  GREETING = 'GREETING',
  RESUME_REQUEST = 'RESUME_REQUEST',
  REQUEST_STATUS = 'REQUEST_STATUS',
  SELECT_STUDY = 'SELECT_STUDY',
  SELECT_CLINIC = 'SELECT_CLINIC',
  SELECT_DATETIME = 'SELECT_DATETIME',
  APPOINTMENT_STATUS = 'APPOINTMENT_STATUS',
  HELP = 'HELP',
  TALK_TO_ADVISOR = 'TALK_TO_ADVISOR',
  UNKNOWN = 'UNKNOWN',
}

export enum SelectionAction {
  SELECT_STUDY = 'SELECT_STUDY',
  SELECT_CLINIC = 'SELECT_CLINIC',
  SELECT_DATETIME = 'SELECT_DATETIME',
}

export class ConversationSelectionDto {
  @ApiProperty({ enum: SelectionAction, example: SelectionAction.SELECT_STUDY })
  @IsEnum(SelectionAction)
  type!: SelectionAction;

  @ApiProperty({ description: 'UUID de catálogo o fecha ISO 8601 con zona horaria.', example: '00000000-0000-4000-8000-000000000201' })
  @IsString()
  @Length(1, 100)
  value!: string;
}

export class ConversationMessageDto extends PartialType(RequestVersionDto, { skipNullProperties: false }) {
  @ApiProperty({ minLength: 1, maxLength: 500, example: 'Quiero continuar mi solicitud' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 500)
  message!: string;

  @ApiPropertyOptional({ format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  requestId?: string;

  @ApiPropertyOptional({ type: ConversationSelectionDto })
  @ValidateIf((_object, value) => value !== undefined)
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ConversationSelectionDto)
  action?: ConversationSelectionDto;
}

const SUGGESTION_TYPES = [
  ...Object.values(SelectionAction), 'SELECT_REQUEST', 'LIST_REQUESTS', 'REQUEST_ASSISTANCE',
] as const;

export class SuggestedActionDto {
  @ApiProperty({ enum: SUGGESTION_TYPES, example: SelectionAction.SELECT_STUDY })
  type!: typeof SUGGESTION_TYPES[number];

  @ApiProperty({ example: 'Demo Glucosa' })
  label!: string;

  @ApiPropertyOptional({ example: '00000000-0000-4000-8000-000000000201' })
  value?: string;

  @ApiPropertyOptional({ format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  requestId?: string;
}

export class ConversationReplyDto {
  @ApiProperty({ example: 'El siguiente paso es elegir un estudio.' })
  reply!: string;

  @ApiProperty({ enum: ConversationIntent, example: ConversationIntent.RESUME_REQUEST })
  intent!: ConversationIntent;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  requestId!: string | null;

  @ApiProperty({ type: String, enum: [...Object.values(RequestStep), null], nullable: true })
  currentStep!: string | null;

  @ApiProperty({ type: String, enum: [...Object.values(ServiceRequestStatus), null], nullable: true })
  requestStatus!: ServiceRequestStatus | null;

  @ApiProperty({ type: Number, nullable: true, example: 2 })
  version!: number | null;

  @ApiPropertyOptional({ type: [SuggestedActionDto] })
  suggestedActions?: SuggestedActionDto[];
}
