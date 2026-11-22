import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse,
  ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AccountDto } from '../auth/auth.dto';
import { CurrentUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../generated/prisma/enums';
import { webSession } from '../requests/request-origin';
import { RequestPaginationDto } from '../requests/requests.dto';
import { AppointmentDto, AppointmentPageDto, ConfirmAppointmentDto } from './appointments.dto';
import { AppointmentsService } from './appointments.service';

@ApiTags('Appointments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Se requiere un JWT activo.' })
@ApiForbiddenResponse({ description: 'Se requiere el rol PATIENT y un perfil asociado.' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.PATIENT])
@Controller()
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post('requests/:id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirmar una solicitud propia o recuperar su confirmación existente' })
  @ApiParam({ name: 'id', format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  @ApiOkResponse({ type: AppointmentDto, description: 'Cita confirmada o recuperada sin duplicarla.' })
  @ApiBadRequestResponse({ description: 'UUID, versión, estado o contexto inválidos para confirmar.' })
  @ApiNotFoundResponse({ description: 'Solicitud inexistente o perteneciente a otro paciente.' })
  @ApiConflictResponse({ description: 'Versión desactualizada, solicitud cerrada o confirmación contradictoria.' })
  confirm(
    @CurrentUser() user: AccountDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ConfirmAppointmentDto,
  ): Promise<AppointmentDto> {
    return this.appointments.confirm(webSession(user), id, input.version);
  }

  @Get('appointments')
  @ApiOperation({ summary: 'Listar las citas propias de forma paginada' })
  @ApiOkResponse({ type: AppointmentPageDto })
  @ApiBadRequestResponse({ description: 'Paginación inválida.' })
  list(@CurrentUser() user: AccountDto, @Query() query: RequestPaginationDto): Promise<AppointmentPageDto> {
    return this.appointments.list(webSession(user).patientId, query);
  }

  @Get('appointments/upcoming')
  @ApiOperation({ summary: 'Listar próximas citas confirmadas de la cuenta' })
  @ApiOkResponse({ type: AppointmentPageDto })
  @ApiBadRequestResponse({ description: 'Paginación inválida.' })
  upcoming(@CurrentUser() user: AccountDto, @Query() query: RequestPaginationDto): Promise<AppointmentPageDto> {
    return this.appointments.list(webSession(user).patientId, query, true);
  }

  @Get('appointments/:id')
  @ApiOperation({ summary: 'Consultar una cita propia' })
  @ApiParam({ name: 'id', format: 'uuid', example: '00000000-0000-4000-8000-000000000004' })
  @ApiOkResponse({ type: AppointmentDto })
  @ApiBadRequestResponse({ description: 'Identificador inválido.' })
  @ApiNotFoundResponse({ description: 'Cita inexistente o perteneciente a otro paciente.' })
  get(@CurrentUser() user: AccountDto, @Param('id', ParseUUIDPipe) id: string): Promise<AppointmentDto> {
    return this.appointments.get(webSession(user).patientId, id);
  }
}
