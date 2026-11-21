import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse,
  ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AccountDto } from '../auth/auth.dto';
import { CurrentUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../generated/prisma/enums';
import { JourneyEntryDto } from '../journey/journey.dto';
import { ListRequestsDto } from '../requests/requests.dto';
import { AdminOverviewDto, AdminRequestPageDto } from './admin-monitoring.dto';
import { AdminMonitoringService } from './admin-monitoring.service';

@ApiTags('Admin Monitoring')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Se requiere un JWT activo.' })
@ApiForbiddenResponse({ description: 'Se requiere el rol ADMIN.' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.ADMIN])
@Controller('admin')
export class AdminMonitoringController {
  constructor(private readonly monitoring: AdminMonitoringService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Consultar indicadores agregados de pacientes, solicitudes y citas' })
  @ApiOkResponse({ type: AdminOverviewDto })
  overview(): Promise<AdminOverviewDto> {
    return this.monitoring.overview();
  }

  @Get('requests')
  @ApiOperation({ summary: 'Listar solicitudes para monitoreo operativo' })
  @ApiOkResponse({ type: AdminRequestPageDto })
  @ApiBadRequestResponse({ description: 'Paginación o estado inválidos.' })
  list(@Query() query: ListRequestsDto): Promise<AdminRequestPageDto> {
    return this.monitoring.list(query);
  }

  @Get('requests/:id/journey')
  @ApiOperation({ summary: 'Consultar la trazabilidad de una solicitud con registro de auditoría' })
  @ApiParam({ name: 'id', format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  @ApiOkResponse({ type: [JourneyEntryDto] })
  @ApiBadRequestResponse({ description: 'UUID inválido.' })
  @ApiNotFoundResponse({ description: 'Solicitud no encontrada.' })
  timeline(@CurrentUser() user: AccountDto, @Param('id', ParseUUIDPipe) id: string): Promise<JourneyEntryDto[]> {
    return this.monitoring.readJourney(user.id, id);
  }
}
