import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse,
  ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AccountDto } from '../auth/auth.dto';
import { CurrentUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../generated/prisma/enums';
import { webSession } from '../requests/request-origin';
import { JourneyEntryDto } from './journey.dto';
import { JourneyService } from './journey.service';

@ApiTags('Journey')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.PATIENT, UserRole.ADVISOR])
@Controller('requests')
export class JourneyController {
  constructor(private readonly journey: JourneyService) {}

  @Get(':id/journey')
  @ApiOperation({ summary: 'Consultar el historial propio o autorizado temporalmente' })
  @ApiParam({ name: 'id', format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  @ApiOkResponse({ type: [JourneyEntryDto] })
  @ApiBadRequestResponse({ description: 'Identificador inválido.' })
  @ApiUnauthorizedResponse({ description: 'Se requiere un JWT activo.' })
  @ApiForbiddenResponse({ description: 'Rol insuficiente o cuenta de paciente sin perfil asociado.' })
  @ApiNotFoundResponse({ description: 'Solicitud inexistente o sin acceso autorizado.' })
  get(@CurrentUser() user: AccountDto, @Param('id', ParseUUIDPipe) id: string): Promise<JourneyEntryDto[]> {
    return user.role === UserRole.ADVISOR
      ? this.journey.forAdvisor(id, user.id)
      : this.journey.forPatient(id, webSession(user).patientId);
  }
}
