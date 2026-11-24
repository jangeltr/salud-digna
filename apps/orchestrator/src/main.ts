import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DatabaseConfigurationError, loadLocalEnv } from './config/database';
import { HttpErrorFilter } from './http-error.filter';

const host = '127.0.0.1';

async function bootstrap(): Promise<void> {
  loadLocalEnv();

  const configuredPort = process.env.ORCHESTRATOR_PORT ?? '3300';
  const port = Number(configuredPort);
  if (!/^\d+$/.test(configuredPort) || port < 1 || port > 65535) {
    console.error('ORCHESTRATOR_PORT debe ser un entero entre 1 y 65535.');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.create(AppModule, { abortOnError: false, logger: false });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpErrorFilter(app.get(HttpAdapterHost)));
  await app.listen(port, host);
  console.info(`Orquestador disponible en http://${host}:${port}`);
}

void bootstrap().catch((error: unknown) => {
  console.error(error instanceof DatabaseConfigurationError ? error.message : 'No se pudo iniciar el orquestador.');
  process.exitCode = 1;
});
