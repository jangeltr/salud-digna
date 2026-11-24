import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

export class DatabaseConfigurationError extends Error {}

export function loadLocalEnv(): void {
  try {
    loadEnvFile(resolve(__dirname, '../../.env'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function readDatabaseUrl(): URL | undefined {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) return undefined;

  const url = URL.parse(value);
  if (!url || !['postgresql:', 'postgres:'].includes(url.protocol)) {
    throw new DatabaseConfigurationError('DATABASE_URL requiere una URL PostgreSQL válida.');
  }

  if (value.includes('?') || value.includes('#')) {
    throw new DatabaseConfigurationError('DATABASE_URL no admite parámetros de conexión ni fragmentos.');
  }

  const expectedHost = process.env.ORCHESTRATOR_DB_HOST ?? '127.0.0.1';
  const expectedPort = process.env.ORCHESTRATOR_DB_PORT ?? '5432';
  if (!url.hostname || url.hostname !== expectedHost || !url.port || url.port !== expectedPort ||
      url.username !== 'salud_digna_orchestrator_app' || url.pathname !== '/salud_digna_orchestrator') {
    throw new DatabaseConfigurationError('DATABASE_URL no coincide con el destino PostgreSQL autorizado del orquestador.');
  }

  try {
    const password = decodeURIComponent(url.password);
    if (!password || password.includes('\0')) throw new Error();
  } catch {
    throw new DatabaseConfigurationError('DATABASE_URL requiere una contraseña válida y no vacía.');
  }

  return url;
}
