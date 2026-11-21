import { Body, Controller, ForbiddenException, Get, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AccountDto } from '../auth/auth.dto';
import { CurrentUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../generated/prisma/enums';
import { IdentityDevelopmentAdapter } from './identity-development.adapter';
import {
  ConfirmIdentityLinkDto,
  IdentityLinkCodeDto,
  LinkedIdentityDto,
  RequestIdentityLinkDto,
} from './identity.dto';
import { IdentityService, type IdentityPatient } from './identity.service';

function requirePatient(user: AccountDto): IdentityPatient {
  if (!user.patientId) throw new ForbiddenException('La cuenta requiere un perfil de paciente.');
  return { id: user.id, patientId: user.patientId };
}

@ApiTags('Identity')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Se requiere un JWT activo.' })
@ApiForbiddenResponse({ description: 'Se requiere rol PATIENT y un perfil asociado.' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.PATIENT])
@Controller('identity')
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly simulator: IdentityDevelopmentAdapter,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Consultar las identidades del paciente autenticado' })
  @ApiOkResponse({ type: [LinkedIdentityDto] })
  list(@CurrentUser() user: AccountDto): Promise<LinkedIdentityDto[]> {
    return this.identity.listOwnIdentities(requirePatient(user).patientId);
  }

  @Post('links')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Solicitar un código de vinculación de cinco minutos' })
  @ApiCreatedResponse({
    type: IdentityLinkCodeDto,
    headers: { 'Cache-Control': { schema: { type: 'string', example: 'no-store' } } },
  })
  @ApiBadRequestResponse({ description: 'Proveedor inválido o campos adicionales.' })
  requestLink(
    @CurrentUser() user: AccountDto,
    @Body() input: RequestIdentityLinkDto,
  ): Promise<IdentityLinkCodeDto> {
    return this.identity.requestLink(requirePatient(user), input.provider);
  }

  @Post('dev/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirmar con una identidad sintética del simulador de desarrollo' })
  @ApiOkResponse({ type: LinkedIdentityDto })
  @ApiBadRequestResponse({ description: 'Solicitud inválida o código incorrecto, consumido, vencido o agotado.' })
  @ApiConflictResponse({ description: 'Identidad de simulación no disponible para vinculación.' })
  @ApiNotFoundResponse({ description: 'Simulador deshabilitado.' })
  confirmSimulation(
    @CurrentUser() user: AccountDto,
    @Body() input: ConfirmIdentityLinkDto,
  ): Promise<LinkedIdentityDto> {
    return this.simulator.confirm(requirePatient(user), input);
  }
}
