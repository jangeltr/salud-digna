import { defineConfig } from 'prisma/config';
import { loadLocalEnv, readDatabaseUrl } from './src/config/database';

loadLocalEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: readDatabaseUrl()?.href },
});
