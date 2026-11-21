import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse,
  ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { CatalogQueryDto } from '../catalogs/catalog-query.dto';
import { UserRole } from '../generated/prisma/enums';
import { CreateClinicDto, ClinicDto, ClinicPageDto, UpdateClinicDto } from './clinics.dto';
import { ClinicsService } from './clinics.service';

const catalogId = { name: 'id', format: 'uuid', example: '00000000-0000-4000-8000-000000000101' };

@ApiTags('Clinics')
@Controller('clinics')
export class ClinicsController {
  constructor(private readonly catalog: ClinicsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar clínicas del catálogo público' })
  @ApiOkResponse({ type: ClinicPageDto })
  @ApiBadRequestResponse({ description: 'Paginación o filtro inválido.' })
  list(@Query() query: CatalogQueryDto): Promise<ClinicPageDto> {
    return this.catalog.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar el detalle público de clínica' })
  @ApiParam(catalogId)
  @ApiOkResponse({ type: ClinicDto })
  @ApiBadRequestResponse({ description: 'Identificador inválido.' })
  @ApiNotFoundResponse({ description: 'Clínica inexistente o desactivada en el catálogo público.' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ClinicDto> {
    return this.catalog.get(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles([UserRole.ADMIN])
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear registro de clínica como ADMIN' })
  @ApiCreatedResponse({ type: ClinicDto })
  @ApiBadRequestResponse({ description: 'Cuerpo inválido o campos adicionales.' })
  @ApiUnauthorizedResponse({ description: 'JWT ausente o inválido.' })
  @ApiForbiddenResponse({ description: 'Se requiere el rol ADMIN.' })
  create(@Body() input: CreateClinicDto): Promise<ClinicDto> {
    return this.catalog.create(input);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles([UserRole.ADMIN])
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modificar, activar o desactivar un registro de clínica como ADMIN' })
  @ApiParam(catalogId)
  @ApiOkResponse({ type: ClinicDto })
  @ApiBadRequestResponse({ description: 'Identificador, cuerpo o campos adicionales inválidos.' })
  @ApiUnauthorizedResponse({ description: 'JWT ausente o inválido.' })
  @ApiForbiddenResponse({ description: 'Se requiere el rol ADMIN.' })
  @ApiNotFoundResponse({ description: 'Clínica no encontrada.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateClinicDto): Promise<ClinicDto> {
    return this.catalog.update(id, input);
  }
}
