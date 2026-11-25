import {
  Body, Controller, ForbiddenException, Header, HttpCode, Injectable, Post, Req, UnauthorizedException, UseGuards,
  type CanActivate, type ExecutionContext,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiHeader, ApiOkResponse, ApiOperation,
  ApiProperty, ApiPropertyOptional, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import type { IncomingMessage } from 'node:http';
import { UserRole } from '../generated/prisma/enums';
import type { AuthRequest } from './authenticated-user';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PatientAssertionsService, type PatientAssertionChannel } from './patient-assertions.service';
import { Roles, RolesGuard } from './roles.guard';

const channelKeyHeader = 'x-patient-assertion-channel-key';

interface AssertionRequest extends AuthRequest {
  headers: IncomingMessage['headers'];
  headersDistinct?: IncomingMessage['headersDistinct'];
  assertionChannel?: PatientAssertionChannel;
}

@Injectable()
export class PatientAssertionChannelGuard implements CanActivate {
  constructor(private readonly assertions: PatientAssertionsService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AssertionRequest>();
    if (request.headers.origin !== undefined) throw new ForbiddenException();
    if ((request.headersDistinct?.[channelKeyHeader]?.length ?? 0) > 1) throw new UnauthorizedException();
    request.assertionChannel = this.assertions.authenticate(request.headers[channelKeyHeader]);
    return true;
  }
}

class IssuePatientAssertionDto {
  @ApiPropertyOptional({ description: 'Consentimiento central obligatorio para ADVISOR y omitido para PATIENT.', writeOnly: true, maxLength: 2048 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  consent?: string;
}

class PatientAssertionConsentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  advisorId!: string;

  @ApiProperty({ maxLength: 64, example: 'demo-callcenter' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  channel!: string;
}

class PatientAssertionDto {
  @ApiProperty({ description: 'JWS institucional para el orquestador', example: '<assertion>' })
  assertion!: string;
}

class ConsentDto {
  @ApiProperty({ description: 'Consentimiento para el asesor y canal destinatarios', example: '<consent>' })
  consent!: string;
}

const cacheControl = { 'Cache-Control': { schema: { type: 'string', example: 'no-store' } } };

@ApiTags('Auth')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Patient-Assertion-Channel-Key', required: true, description: 'Credencial privada del backend de canal.' })
@ApiBadRequestResponse({ description: 'Cuerpo inválido o campos adicionales.' })
@ApiUnauthorizedResponse({ description: 'Credencial de canal o sesión ausente o inválida.' })
@ApiForbiddenResponse({ description: 'Canal, rol o autorización insuficiente.' })
@ApiServiceUnavailableResponse({ description: 'El emisor institucional no está disponible.' })
@UseGuards(PatientAssertionChannelGuard, JwtAuthGuard, RolesGuard)
@Controller('auth')
export class PatientAssertionsController {
  constructor(private readonly assertions: PatientAssertionsService) {}

  @Post('patient-assertions')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Roles([UserRole.PATIENT, UserRole.ADVISOR])
  @ApiOperation({ summary: 'Emitir una acreditación institucional para un backend de canal' })
  @ApiOkResponse({ type: PatientAssertionDto, headers: cacheControl })
  issue(@Req() request: AssertionRequest, @Body() body: IssuePatientAssertionDto) {
    const { user, assertionChannel, sessionExpiresAt } = request;
    if (!user || !assertionChannel || sessionExpiresAt === undefined) throw new UnauthorizedException();
    return this.assertions.issue(user, assertionChannel, sessionExpiresAt, body?.consent);
  }

  @Post('patient-assertion-consents')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Roles([UserRole.PATIENT])
  @ApiOperation({ summary: 'Autorizar a un asesor y canal concretos para la recuperación institucional' })
  @ApiOkResponse({ type: ConsentDto, headers: cacheControl })
  consent(@Req() request: AssertionRequest, @Body() body: PatientAssertionConsentDto) {
    const { user, assertionChannel, sessionExpiresAt } = request;
    if (!user || !assertionChannel || sessionExpiresAt === undefined) throw new UnauthorizedException();
    return this.assertions.consent(user, assertionChannel, sessionExpiresAt, body.advisorId, body.channel);
  }
}
