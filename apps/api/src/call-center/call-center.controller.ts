import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse,
  ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AppointmentDto, ConfirmAppointmentDto } from '../appointments/appointments.dto';
import type { AccountDto } from '../auth/auth.dto';
import { AuthAttemptsGuard } from '../auth/auth-attempts.guard';
import { CurrentUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../generated/prisma/enums';
import { webSession } from '../requests/request-origin';
import { AssistanceCodeDto, AssistanceGrantDto, AssistedRequestDto, ClaimAssistanceDto } from './call-center.dto';
import { CallCenterService } from './call-center.service';

const requestId = { name: 'id', format: 'uuid', example: '00000000-0000-4000-8000-000000000001' };
const unavailable = { description: 'Solicitud inexistente o sin permiso vigente para esta cuenta.' };

@ApiTags('Call Center')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Se requiere un JWT activo.' })
@ApiForbiddenResponse({ description: 'Rol insuficiente o cuenta de paciente sin perfil asociado.' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.ADVISOR])
@Controller()
export class CallCenterController {
  constructor(private readonly callCenter: CallCenterService) {}

  @Post('requests/:id/assistance-code')
  @Roles([UserRole.PATIENT])
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Emitir una referencia de cinco minutos para una solicitud propia abierta' })
  @ApiParam(requestId)
  @ApiCreatedResponse({ type: AssistanceCodeDto })
  @ApiBadRequestResponse({ description: 'UUID inválido.' })
  @ApiNotFoundResponse(unavailable)
  @ApiConflictResponse({ description: 'Solicitud cerrada.' })
  issue(@CurrentUser() user: AccountDto, @Param('id', ParseUUIDPipe) id: string): Promise<AssistanceCodeDto> {
    return this.callCenter.issue(webSession(user), id);
  }

  @Post('call-center/claim')
  @HttpCode(200)
  @UseGuards(AuthAttemptsGuard)
  @ApiOperation({ summary: 'Canjear la referencia y autorizar al asesor actual durante 30 minutos' })
  @ApiOkResponse({ type: AssistanceGrantDto })
  @ApiBadRequestResponse({ description: 'Referencia inválida, vencida, consumida o de una solicitud cerrada.' })
  @ApiTooManyRequestsResponse({
    description: 'Límite de intentos de canje alcanzado.',
    headers: { 'Retry-After': { schema: { type: 'integer' }, description: 'Segundos antes de reintentar.' } },
  })
  claim(@CurrentUser() user: AccountDto, @Body() input: ClaimAssistanceDto): Promise<AssistanceGrantDto> {
    return this.callCenter.claim(user.id, input.code);
  }

  @Get('call-center/requests/:id')
  @ApiOperation({ summary: 'Recuperar la solicitud y el contexto con permiso de atención vigente' })
  @ApiParam(requestId)
  @ApiOkResponse({ type: AssistedRequestDto })
  @ApiBadRequestResponse({ description: 'UUID inválido.' })
  @ApiNotFoundResponse(unavailable)
  get(@CurrentUser() user: AccountDto, @Param('id', ParseUUIDPipe) id: string): Promise<AssistedRequestDto> {
    return this.callCenter.getRequest(user.id, id);
  }

  @Post('call-center/requests/:id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirmar o recuperar una cita con permiso de atención vigente' })
  @ApiParam(requestId)
  @ApiOkResponse({ type: AppointmentDto })
  @ApiBadRequestResponse({ description: 'UUID, cuerpo, estado o contexto inválidos para confirmar.' })
  @ApiNotFoundResponse(unavailable)
  @ApiConflictResponse({ description: 'Versión desactualizada, solicitud cerrada o confirmación contradictoria.' })
  confirm(
    @CurrentUser() user: AccountDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ConfirmAppointmentDto,
  ): Promise<AppointmentDto> {
    return this.callCenter.confirm(user.id, id, input.version);
  }
}
