import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { DatabaseConfigurationError, readDatabaseUrl } from '../config/database';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService implements OnApplicationShutdown {
  readonly client: PrismaClient;

  constructor() {
    const url = readDatabaseUrl();
    if (!url) {
      throw new DatabaseConfigurationError('Se requiere DATABASE_URL para iniciar el orquestador.');
    }

    const adapter = new PrismaPg(
      { connectionString: url.href, connectionTimeoutMillis: 3000 },
      { schema: url.searchParams.get('schema') ?? 'public' },
    );
    this.client = new PrismaClient({ adapter });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.$disconnect();
  }
}
