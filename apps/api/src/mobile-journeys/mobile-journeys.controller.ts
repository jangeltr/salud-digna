import {
  Body, Controller, Get, Header, Headers, Param, ParseUUIDPipe, Post, Query, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse, ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse,
  ApiGatewayTimeoutResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam,
  ApiServiceUnavailableResponse, ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthRequest } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../generated/prisma/enums';
import {
  CreateMobileJourneyDto, MobileEventReceiptDto, MobileHistoryQueryDto, MobileJourneyContextDto, MobileJourneyCreatedDto,
  MobileJourneyHistoryDto, MobileJourneyListDto, MobileJourneySummaryDto, PublishMobileEventDto,
} from './mobile-journeys.dto';
import { MobileJourneysService, type MobileSession } from './mobile-journeys.service';

const journeyParam = { name: 'journeyId', format: 'uuid' };

function session(request: AuthRequest): MobileSession {
  if (!request.user || request.sessionExpiresAt === undefined) throw new UnauthorizedException();
  return { user: request.user, expiresAt: request.sessionExpiresAt };
}

@ApiTags('Mobile Journeys')
@ApiBearerAuth()
@ApiBadRequestResponse({ description: 'Entrada inválida.' })
@ApiUnauthorizedResponse({ description: 'Se requiere una sesión JWT activa.' })
@ApiForbiddenResponse({ description: 'Se requiere una cuenta de paciente con perfil.' })
@ApiNotFoundResponse({ description: 'Identidad institucional aún sin vínculo o trámite inaccesible.' })
@ApiTooManyRequestsResponse({ description: 'La integración está temporalmente limitada.' })
@ApiBadGatewayResponse({ description: 'Falló la comunicación con el orquestador o la respuesta fue inválida.' })
@ApiServiceUnavailableResponse({ description: 'La integración no está disponible.' })
@ApiGatewayTimeoutResponse({ description: 'El orquestador excedió el tiempo de respuesta.' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.PATIENT])
@Controller('mobile/journeys')
export class MobileJourneysController {
  constructor(private readonly journeys: MobileJourneysService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Listar trámites activos del paciente autenticado' })
  @ApiOkResponse({ type: MobileJourneyListDto })
  list(@Req() request: AuthRequest) {
    return this.journeys.list(session(request));
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Crear un trámite de cita identificado desde el canal móvil' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: '32 bytes aleatorios en base64url sin relleno.' })
  @ApiCreatedResponse({ type: MobileJourneyCreatedDto })
  @ApiConflictResponse({ description: 'Conflicto de idempotencia.' })
  create(@Req() request: AuthRequest, @Headers('idempotency-key') key: unknown, @Body() input: CreateMobileJourneyDto) {
    return this.journeys.create(session(request), key, input);
  }

  @Get(':journeyId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Consultar el estado de un trámite autorizado' })
  @ApiParam(journeyParam)
  @ApiOkResponse({ type: MobileJourneySummaryDto })
  summary(@Req() request: AuthRequest, @Param('journeyId', ParseUUIDPipe) id: string) {
    return this.journeys.summary(session(request), id.toLowerCase());
  }

  @Get(':journeyId/context')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Recuperar el contexto de un trámite autorizado' })
  @ApiParam(journeyParam)
  @ApiOkResponse({ type: MobileJourneyContextDto })
  context(@Req() request: AuthRequest, @Param('journeyId', ParseUUIDPipe) id: string) {
    return this.journeys.context(session(request), id.toLowerCase());
  }

  @Get(':journeyId/history')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Consultar el historial cronológico de un trámite autorizado' })
  @ApiParam(journeyParam)
  @ApiOkResponse({ type: MobileJourneyHistoryDto })
  history(@Req() request: AuthRequest, @Param('journeyId', ParseUUIDPipe) id: string, @Query() query: MobileHistoryQueryDto) {
    return this.journeys.history(session(request), id.toLowerCase(), query);
  }

  @Post(':journeyId/events')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Registrar un avance idempotente desde el canal móvil' })
  @ApiParam(journeyParam)
  @ApiCreatedResponse({ type: MobileEventReceiptDto })
  @ApiConflictResponse({ description: 'Versión obsoleta, transición inválida o ID de evento reutilizado con otro contenido.' })
  publish(@Req() request: AuthRequest, @Param('journeyId', ParseUUIDPipe) id: string, @Body() event: PublishMobileEventDto) {
    return this.journeys.publish(session(request), id.toLowerCase(), event);
  }
}
