import { defineConfig } from 'prisma/config';
import { loadLocalEnv } from './src/config/load-local-env';

loadLocalEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
});
