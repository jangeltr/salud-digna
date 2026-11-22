import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { WHATSAPP_WEBHOOK_PATH, whatsappEnabled } from './whatsapp/whatsapp.config';

async function bootstrap() {
  const { host, port, corsOrigins } = loadConfig();
  const enabled = whatsappEnabled();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.configure(), { rawBody: enabled });
  if (enabled) {
    app.useBodyParser('raw', {
      limit: '256kb',
      inflate: false,
      type: (request) => {
        const path = request.url?.split('?')[0].toLowerCase().replace(/\/$/, '');
        return request.method === 'POST' && path === WHATSAPP_WEBHOOK_PATH;
      },
    });
  }

  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: corsOrigins });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  const openApi = new DocumentBuilder()
    .setTitle('Salud Digna API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, openApi));

  await app.listen(port, host);
}

void bootstrap();
