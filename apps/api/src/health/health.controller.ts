import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
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
}
