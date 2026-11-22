import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { literalCatalogSearch, type CatalogQueryDto } from '../catalogs/catalog-query.dto';
import type { CreateStudyDto, StudyDto, StudyPageDto, UpdateStudyDto } from './studies.dto';

const studyFields = {
  id: true, name: true, description: true, price: true, isActive: true,
} satisfies Prisma.StudySelect;

function toPublicStudy(study: Prisma.StudyGetPayload<{ select: typeof studyFields }>): StudyDto {
  return { ...study, price: study.price.toFixed(2) };
}

@Injectable()
export class StudiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list({ page, limit, q }: CatalogQueryDto): Promise<StudyPageDto> {
    const rows = await this.prisma.client.study.findMany({
      where: { isActive: true, name: q ? { contains: literalCatalogSearch(q), mode: 'insensitive' } : undefined },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit + 1,
      select: studyFields,
    });
    return { page, limit, items: rows.slice(0, limit).map(toPublicStudy), hasMore: rows.length > limit };
  }

  async get(id: string): Promise<StudyDto> {
    const study = await this.prisma.client.study.findUnique({
      where: { id, isActive: true }, select: studyFields,
    });
    if (!study) throw new NotFoundException('Estudio no encontrado.');
    return toPublicStudy(study);
  }

  async create({ price, ...data }: CreateStudyDto): Promise<StudyDto> {
    return toPublicStudy(await this.prisma.client.study.create({
      data: { ...data, price: new Prisma.Decimal(price) },
      select: studyFields,
    }));
  }

  async update(id: string, { price, ...data }: UpdateStudyDto): Promise<StudyDto> {
    try {
      return toPublicStudy(await this.prisma.client.study.update({
        where: { id },
        data: { ...data, price: price === undefined ? undefined : new Prisma.Decimal(price) },
        select: studyFields,
      }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Estudio no encontrado.');
      }
      throw error;
    }
  }
}
