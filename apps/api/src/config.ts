import { loadLocalEnv } from './config/load-local-env';

export function loadConfig() {
  loadLocalEnv();

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV debe ser development, test o production.');
  }
  process.env.NODE_ENV = nodeEnv;

  const host = (process.env.API_HOST ?? '127.0.0.1').trim();
  if (!host) {
    throw new Error('API_HOST no puede estar vacío.');
  }
  const trustLocalProxy = process.env.TRUST_LOCAL_PROXY === 'true';
  if (trustLocalProxy && host !== '127.0.0.1') {
    throw new Error('TRUST_LOCAL_PROXY=true requiere API_HOST=127.0.0.1.');
  }

  const rawPort = (process.env.API_PORT ?? '3000').trim();
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) {
    throw new Error('API_PORT debe ser un entero entre 1 y 65535.');
  }

  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      const url = URL.parse(origin);
      if (!url || !['http:', 'https:'].includes(url.protocol) || url.origin !== origin || origin.includes('*')) {
        throw new Error('CORS_ORIGINS debe contener orígenes HTTP(S) sin rutas ni comodines.');
      }
      return url.origin;
    });

  return { host, port, corsOrigins, trustLocalProxy };
}
