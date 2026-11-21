import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { literalCatalogSearch, type CatalogQueryDto } from '../catalogs/catalog-query.dto';
import type { ClinicDto, ClinicPageDto, CreateClinicDto, UpdateClinicDto } from './clinics.dto';

const clinicFields = {
  id: true, name: true, address: true, city: true, state: true, isActive: true,
} satisfies Prisma.ClinicSelect;

@Injectable()
export class ClinicsService {
  constructor(private readonly prisma: PrismaService) {}

  async list({ page, limit, q }: CatalogQueryDto): Promise<ClinicPageDto> {
    const items = await this.prisma.client.clinic.findMany({
      where: { isActive: true, name: q ? { contains: literalCatalogSearch(q), mode: 'insensitive' } : undefined },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit + 1,
      select: clinicFields,
    });
    return { page, limit, items: items.slice(0, limit), hasMore: items.length > limit };
  }

  async get(id: string): Promise<ClinicDto> {
    const clinic = await this.prisma.client.clinic.findUnique({
      where: { id, isActive: true }, select: clinicFields,
    });
    if (!clinic) throw new NotFoundException('Clínica no encontrada.');
    return clinic;
  }

  create(data: CreateClinicDto): Promise<ClinicDto> {
    return this.prisma.client.clinic.create({ data, select: clinicFields });
  }

  async update(id: string, data: UpdateClinicDto): Promise<ClinicDto> {
    try {
      return await this.prisma.client.clinic.update({ where: { id }, data, select: clinicFields });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Clínica no encontrada.');
      }
      throw error;
    }
  }
}
