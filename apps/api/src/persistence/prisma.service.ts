import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService implements OnApplicationShutdown {
  private prisma?: PrismaClient;

  get client(): PrismaClient {
    if (!this.prisma) {
      const connectionString = process.env.DATABASE_URL?.trim();
      const url = connectionString && URL.parse(connectionString);
      if (!url || !['postgresql:', 'postgres:'].includes(url.protocol)) {
        throw new Error('DATABASE_URL requiere una URL PostgreSQL válida.');
      }

      const adapter = new PrismaPg(
        { connectionString, connectionTimeoutMillis: 3000 },
        { schema: url.searchParams.get('schema') ?? 'public' },
      );
      this.prisma = new PrismaClient({ adapter });
    }

    return this.prisma;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.prisma?.$disconnect();
  }
}
