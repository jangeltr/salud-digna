import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { JourneyEntryDto } from '../journey/journey.dto';
import { RequestSnapshotDto } from '../requests/requests.dto';

const codePattern = /^[A-Za-z0-9_-]{22}$/;
const codeExample = 'EjemploSintetico_00001';

export class ClaimAssistanceDto {
  @ApiProperty({ pattern: codePattern.source, writeOnly: true, example: codeExample })
  @IsString()
  @Matches(codePattern)
  code!: string;
}

export class AssistanceCodeDto {
  @ApiProperty({ pattern: codePattern.source, example: codeExample })
  code!: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-21T19:05:00.000Z' })
  expiresAt!: Date;
}

export class AssistanceGrantDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  requestId!: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-21T19:31:00.000Z' })
  expiresAt!: Date;
}

class AssistedPatientDto {
  @ApiProperty({ example: 'Alex' })
  firstName!: string;

  @ApiProperty({ example: 'Ejemplo' })
  lastName!: string;
}

class AssistedSelectionDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000201' })
  id!: string;

  @ApiProperty({ example: 'Demo Glucosa' })
  name!: string;
}

export class AssistedRequestDto extends RequestSnapshotDto {
  @ApiProperty({ type: AssistedPatientDto })
  patient!: AssistedPatientDto;

  @ApiProperty({ type: AssistedSelectionDto, nullable: true })
  study!: AssistedSelectionDto | null;

  @ApiProperty({ type: AssistedSelectionDto, nullable: true })
  clinic!: AssistedSelectionDto | null;

  @ApiProperty({ type: [JourneyEntryDto], description: 'Hasta diez eventos recientes, en orden cronológico.' })
  recentEvents!: JourneyEntryDto[];
}
