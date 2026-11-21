import { Controller, Get, NotFoundException } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({
    description: 'El servicio está operativo.',
    schema: {
      type: 'object',
      required: ['status'],
      properties: { status: { type: 'string', enum: ['ok'] } },
      example: { status: 'ok' },
    },
  })
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('db')
  @ApiOperation({ summary: 'Diagnóstico operativo de PostgreSQL. Disponible fuera de producción.' })
  @ApiOkResponse({
    description: 'PostgreSQL responde.',
    schema: {
      type: 'object',
      required: ['status'],
      properties: { status: { type: 'string', enum: ['ok'] } },
      example: { status: 'ok' },
    },
  })
  @ApiServiceUnavailableResponse({ description: 'Base de datos no disponible.' })
  @ApiNotFoundResponse({ description: 'Diagnóstico deshabilitado en producción.' })
  getDatabaseHealth(): Promise<{ status: 'ok' }> {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }

    return this.healthService.checkDatabase();
  }
}
