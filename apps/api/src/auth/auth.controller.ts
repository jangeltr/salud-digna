import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthAttemptsGuard } from './auth-attempts.guard';
import { AccountDto, LoginDto, LoginResponseDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './authenticated-user';
import { JwtAuthGuard } from './jwt-auth.guard';

const throttled = {
  description: 'Límite de intentos alcanzado.',
  headers: { 'Retry-After': { description: 'Segundos antes de reintentar.', schema: { type: 'integer' } } },
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @UseGuards(AuthAttemptsGuard)
  @ApiOperation({ summary: 'Registrar una cuenta de paciente' })
  @ApiCreatedResponse({ type: AccountDto })
  @ApiBadRequestResponse({ description: 'Datos de registro inválidos.' })
  @ApiConflictResponse({ description: 'Correo ya registrado.' })
  @ApiTooManyRequestsResponse(throttled)
  register(@Body() body: RegisterDto): Promise<AccountDto> {
    return this.auth.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthAttemptsGuard)
  @ApiOperation({ summary: 'Iniciar sesión con correo y contraseña' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de inicio de sesión inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Correo o contraseña incorrectos.' })
  @ApiTooManyRequestsResponse(throttled)
  login(@Body() body: LoginDto): Promise<LoginResponseDto> {
    return this.auth.login(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consultar la cuenta autenticada' })
  @ApiOkResponse({ type: AccountDto })
  @ApiUnauthorizedResponse({ description: 'Token ausente, inválido o cuenta sin acceso.' })
  me(@CurrentUser() user: AccountDto): AccountDto {
    return user;
  }
}
