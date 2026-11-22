import 'reflect-metadata';
import { isDeepStrictEqual } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../app.module';
import { API_PREFIX, createOpenApiDocument } from './openapi-document';

const publicOrigin = 'https://api.salud-digna.app';

async function discover(provider: 'meta' | 'twilio') {
  Object.assign(process.env, {
    NODE_ENV: 'development',
    JWT_SECRET: 'local-openapi-export-only-never-used-to-sign',
    JWT_EXPIRES_IN: '1800',
    DATABASE_URL: '',
    OPENAI_ENABLED: 'false',
    CONVERSATION_SIMULATOR_ENABLED: 'true',
    WHATSAPP_ENABLED: 'true',
    WHATSAPP_PROVIDER: provider,
    WHATSAPP_VERIFY_TOKEN: 'openapi-export-only',
    WHATSAPP_APP_SECRET: 'openapi-export-only',
    WHATSAPP_ACCESS_TOKEN: 'openapi-export-only',
    WHATSAPP_PHONE_NUMBER_ID: '123456789',
    WHATSAPP_GRAPH_API_VERSION: 'v25.0',
    TWILIO_ACCOUNT_SID: 'AC' + '0'.repeat(32),
    TWILIO_AUTH_TOKEN: 'openapi-export-only',
    TWILIO_WHATSAPP_FROM: 'whatsapp:+12025550100',
    TWILIO_WEBHOOK_URL: 'https://example.test/api/v1/webhooks/twilio/whatsapp',
  });

  const app = await NestFactory.create(AppModule.configure(), { logger: false, abortOnError: false });
  try {
    app.setGlobalPrefix(API_PREFIX);
    // Swagger solo necesita metadatos. init/listen iniciarían hooks y el trabajador de WhatsApp.
    return createOpenApiDocument(app, publicOrigin);
  } finally {
    await app.close();
  }
}

function merge<T>(original: Record<string, T>, extra: Record<string, T>): Record<string, T> {
  const merged = { ...original };
  for (const [key, value] of Object.entries(extra)) {
    if (Object.hasOwn(merged, key) && !isDeepStrictEqual(merged[key], value)) {
      throw new Error(`Los perfiles OpenAPI difieren para ${key}.`);
    }
    merged[key] = value;
  }
  return merged;
}

async function exportOpenApi(): Promise<void> {
  const meta = await discover('meta');
  const twilio = await discover('twilio');
  const document: OpenAPIObject = {
    ...meta,
    paths: merge(meta.paths, twilio.paths),
    components: {
      ...meta.components,
      schemas: merge(meta.components?.schemas ?? {}, twilio.components?.schemas ?? {}),
      securitySchemes: merge(meta.components?.securitySchemes ?? {}, twilio.components?.securitySchemes ?? {}),
    },
  };
  const path = resolve(__dirname, '../../../../docs/openapi.json');
  await writeFile(path, JSON.stringify(document, null, 2) + '\n', 'utf8');
  console.log('Contrato generado en docs/openapi.json');
}

void exportOpenApi().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
