import { ApiProperty, PickType } from '@nestjs/swagger';
import { RequestSnapshotDto } from '../requests/requests.dto';

class StatusDistributionDto {
  @ApiProperty({ example: 2 })
  DRAFT!: number;

  @ApiProperty({ example: 1 })
  IN_PROGRESS!: number;

  @ApiProperty({ example: 0 })
  PENDING_CONFIRMATION!: number;

  @ApiProperty({ example: 2 })
  COMPLETED!: number;

  @ApiProperty({ example: 0 })
  CANCELLED!: number;
}

export class AdminOverviewDto {
  @ApiProperty({ example: 3 })
  totalPatients!: number;

  @ApiProperty({ example: 5 })
  requestsCreated!: number;

  @ApiProperty({ example: 3 })
  openRequests!: number;

  @ApiProperty({ example: 2 })
  completedRequests!: number;

  @ApiProperty({ example: 2 })
  confirmedAppointments!: number;

  @ApiProperty({ type: StatusDistributionDto })
  requestsByStatus!: StatusDistributionDto;
}

export class AdminRequestDto extends PickType(RequestSnapshotDto, [
  'id', 'status', 'currentStep', 'lastChannel', 'createdAt', 'updatedAt',
]) {}

export class AdminRequestPageDto {
  @ApiProperty({ type: [AdminRequestDto] })
  items!: AdminRequestDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: false })
  hasMore!: boolean;
}
