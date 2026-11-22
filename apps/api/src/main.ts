import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX, createOpenApiDocument } from './openapi/openapi-document';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { TWILIO_WEBHOOK_PATH, WHATSAPP_WEBHOOK_PATH, selectedWhatsAppProvider, whatsappEnabled } from './whatsapp/whatsapp.config';

async function bootstrap() {
  const { host, port, corsOrigins } = loadConfig();
  const enabled = whatsappEnabled();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.configure(), { rawBody: enabled });
  if (enabled) {
    const webhookPath = selectedWhatsAppProvider() === 'meta' ? WHATSAPP_WEBHOOK_PATH : TWILIO_WEBHOOK_PATH;
    app.useBodyParser('raw', {
      limit: '256kb',
      inflate: false,
      type: (request) => {
        const path = request.url?.split('?')[0].toLowerCase().replace(/\/$/, '');
        return request.method === 'POST' && path === webhookPath;
      },
    });
  }

  app.enableShutdownHooks();
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({ origin: corsOrigins });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  SwaggerModule.setup('api/docs', app, () => createOpenApiDocument(app));

  await app.listen(port, host);
}

void bootstrap();
