import { defineConfig } from 'prisma/config';
import { loadLocalEnv } from './src/config/load-local-env';

const openApiExport = process.env.OPENAPI_EXPORT === 'true';
if (!openApiExport) loadLocalEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: openApiExport ? '' : (process.env.DATABASE_URL ?? ''),
    shadowDatabaseUrl: openApiExport ? undefined : (process.env.SHADOW_DATABASE_URL || undefined),
  },
});
