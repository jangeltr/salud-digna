import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async checkDatabase(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Base de datos no disponible.');
    }
  }
}
