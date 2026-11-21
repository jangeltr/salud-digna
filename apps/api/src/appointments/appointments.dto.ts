import { ApiProperty } from '@nestjs/swagger';
import { AppointmentStatus } from '../generated/prisma/enums';
import { RequestVersionDto } from '../requests/requests.dto';

export class ConfirmAppointmentDto extends RequestVersionDto {}

class StudySummaryDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000201' })
  id!: string;

  @ApiProperty({ example: 'Demo Glucosa' })
  name!: string;
}

class ClinicSummaryDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000101' })
  id!: string;

  @ApiProperty({ example: 'Demo Clínica Alameda' })
  name!: string;
}

export class AppointmentDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000004' })
  id!: string;

  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  requestId!: string;

  @ApiProperty({ type: StudySummaryDto })
  study!: StudySummaryDto;

  @ApiProperty({ type: ClinicSummaryDto })
  clinic!: ClinicSummaryDto;

  @ApiProperty({ format: 'date-time', example: '2027-01-05T16:30:00.000Z' })
  scheduledAt!: Date;

  @ApiProperty({ enum: AppointmentStatus, enumName: 'AppointmentStatus', example: AppointmentStatus.CONFIRMED })
  status!: AppointmentStatus;

  @ApiProperty({ format: 'date-time', example: '2026-11-21T19:10:00.000Z' })
  createdAt!: Date;
}

export class AppointmentPageDto {
  @ApiProperty({ type: [AppointmentDto] })
  items!: AppointmentDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: false })
  hasMore!: boolean;
}
