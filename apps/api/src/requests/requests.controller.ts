import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse,
  ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AccountDto } from '../auth/auth.dto';
import { CurrentUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../generated/prisma/enums';
import {
  CreateRequestDto, ListRequestsDto, RequestPageDto, RequestPaginationDto,
  RequestSnapshotDto, RequestVersionDto, UpdateRequestContextDto,
} from './requests.dto';
import { webSession } from './request-origin';
import { RequestsService } from './requests.service';

const conflict = { description: 'Versión desactualizada o solicitud cerrada. Consulta el estado vigente.' };
const notFound = { description: 'Solicitud inexistente o fuera del perfil autenticado.' };
const requestId = { name: 'id', format: 'uuid', example: '00000000-0000-4000-8000-000000000001' };

@ApiTags('Requests')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Se requiere un JWT activo.' })
@ApiForbiddenResponse({ description: 'Se requiere rol PATIENT y un perfil asociado.' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.PATIENT])
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una solicitud de agendamiento' })
  @ApiCreatedResponse({ type: RequestSnapshotDto })
  @ApiBadRequestResponse({ description: 'Tipo de solicitud inválido o campos adicionales.' })
  create(@CurrentUser() user: AccountDto, @Body() _input: CreateRequestDto): Promise<RequestSnapshotDto> {
    return this.requests.create(webSession(user));
  }

  @Get()
  @ApiOperation({ summary: 'Listar las solicitudes propias con filtro opcional por estado' })
  @ApiOkResponse({ type: RequestPageDto })
  @ApiBadRequestResponse({ description: 'Parámetros de lista inválidos.' })
  list(@CurrentUser() user: AccountDto, @Query() query: ListRequestsDto): Promise<RequestPageDto> {
    return this.requests.list(webSession(user), query, query.status);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Recuperar las solicitudes abiertas más recientemente modificadas' })
  @ApiOkResponse({ type: RequestPageDto })
  @ApiBadRequestResponse({ description: 'Paginación inválida.' })
  pending(@CurrentUser() user: AccountDto, @Query() query: RequestPaginationDto): Promise<RequestPageDto> {
    return this.requests.list(webSession(user), query, undefined, true);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Recuperar el contexto y estado persistidos' })
  @ApiParam(requestId)
  @ApiOkResponse({ type: RequestSnapshotDto })
  @ApiBadRequestResponse({ description: 'Identificador inválido.' })
  @ApiNotFoundResponse(notFound)
  get(@CurrentUser() user: AccountDto, @Param('id', ParseUUIDPipe) id: string): Promise<RequestSnapshotDto> {
    return this.requests.get(webSession(user), id);
  }

  @Patch(':id/context')
  @ApiOperation({ summary: 'Actualizar parcialmente el contexto de una solicitud abierta' })
  @ApiParam(requestId)
  @ApiOkResponse({ type: RequestSnapshotDto })
  @ApiBadRequestResponse({ description: 'Versión, campos, selecciones o fecha inválidos.' })
  @ApiNotFoundResponse(notFound)
  @ApiConflictResponse(conflict)
  update(
    @CurrentUser() user: AccountDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateRequestContextDto,
  ): Promise<RequestSnapshotDto> {
    return this.requests.updateContext(webSession(user), id, input);
  }

  @Post(':id/pause')
  @HttpCode(200)
  @ApiOperation({ summary: 'Registrar una interrupción y conservar el avance de la solicitud' })
  @ApiParam(requestId)
  @ApiOkResponse({ type: RequestSnapshotDto })
  @ApiBadRequestResponse({ description: 'Identificador, versión o cuerpo inválidos.' })
  @ApiNotFoundResponse(notFound)
  @ApiConflictResponse(conflict)
  pause(
    @CurrentUser() user: AccountDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RequestVersionDto,
  ): Promise<RequestSnapshotDto> {
    return this.requests.recordActivity(webSession(user), id, input.version, 'REQUEST_PAUSED');
  }

  @Post(':id/resume')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reanudar una solicitud abierta desde el canal de la sesión' })
  @ApiParam(requestId)
  @ApiOkResponse({ type: RequestSnapshotDto })
  @ApiBadRequestResponse({ description: 'Identificador, versión o cuerpo inválidos.' })
  @ApiNotFoundResponse(notFound)
  @ApiConflictResponse(conflict)
  resume(
    @CurrentUser() user: AccountDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RequestVersionDto,
  ): Promise<RequestSnapshotDto> {
    return this.requests.recordActivity(webSession(user), id, input.version, 'REQUEST_RESUMED');
  }
}
