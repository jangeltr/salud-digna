import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const API_PREFIX = 'api/v1';

export function createOpenApiDocument(app: INestApplication, publicOrigin?: string) {
  const builder = new DocumentBuilder()
    .setTitle('Salud Digna API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
  if (publicOrigin) {
    builder.addServer(publicOrigin).setDescription(
      'Contrato generado del backend. Las rutas de simulación y los webhooks dependen de la configuración. Los webhooks de Meta y Twilio corresponden a perfiles alternativos.',
    );
  }
  return SwaggerModule.createDocument(app, builder.build());
}
