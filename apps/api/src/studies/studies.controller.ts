import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse,
  ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { CatalogQueryDto } from '../catalogs/catalog-query.dto';
import { UserRole } from '../generated/prisma/enums';
import { CreateStudyDto, StudyDto, StudyPageDto, UpdateStudyDto } from './studies.dto';
import { StudiesService } from './studies.service';

const catalogId = { name: 'id', format: 'uuid', example: '00000000-0000-4000-8000-000000000201' };

@ApiTags('Studies')
@Controller('studies')
export class StudiesController {
  constructor(private readonly catalog: StudiesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar estudios del catálogo público' })
  @ApiOkResponse({ type: StudyPageDto })
  @ApiBadRequestResponse({ description: 'Paginación o filtro inválido.' })
  list(@Query() query: CatalogQueryDto): Promise<StudyPageDto> {
    return this.catalog.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar el detalle público de estudio' })
  @ApiParam(catalogId)
  @ApiOkResponse({ type: StudyDto })
  @ApiBadRequestResponse({ description: 'Identificador inválido.' })
  @ApiNotFoundResponse({ description: 'Estudio inexistente o desactivado en el catálogo público.' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<StudyDto> {
    return this.catalog.get(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles([UserRole.ADMIN])
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear registro de estudio como ADMIN' })
  @ApiCreatedResponse({ type: StudyDto })
  @ApiBadRequestResponse({ description: 'Cuerpo inválido o campos adicionales.' })
  @ApiUnauthorizedResponse({ description: 'JWT ausente o inválido.' })
  @ApiForbiddenResponse({ description: 'Se requiere el rol ADMIN.' })
  create(@Body() input: CreateStudyDto): Promise<StudyDto> {
    return this.catalog.create(input);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles([UserRole.ADMIN])
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modificar, activar o desactivar un registro de estudio como ADMIN' })
  @ApiParam(catalogId)
  @ApiOkResponse({ type: StudyDto })
  @ApiBadRequestResponse({ description: 'Identificador, cuerpo o campos adicionales inválidos.' })
  @ApiUnauthorizedResponse({ description: 'JWT ausente o inválido.' })
  @ApiForbiddenResponse({ description: 'Se requiere el rol ADMIN.' })
  @ApiNotFoundResponse({ description: 'Estudio no encontrado.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateStudyDto): Promise<StudyDto> {
    return this.catalog.update(id, input);
  }
}
