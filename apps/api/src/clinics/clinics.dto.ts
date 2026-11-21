import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Length, ValidateIf } from 'class-validator';
import { CatalogPageDto, trimText } from '../catalogs/catalog-query.dto';

export class CreateClinicDto {
  @ApiProperty({ minLength: 1, maxLength: 120, example: 'Demo Clínica Alameda' })
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ minLength: 1, maxLength: 250, example: 'Avenida Ejemplo 101' })
  @Transform(trimText)
  @IsString()
  @Length(1, 250)
  address!: string;

  @ApiProperty({ minLength: 1, maxLength: 100, example: 'Ciudad Ejemplo' })
  @Transform(trimText)
  @IsString()
  @Length(1, 100)
  city!: string;

  @ApiProperty({ minLength: 1, maxLength: 100, example: 'Estado Ejemplo' })
  @Transform(trimText)
  @IsString()
  @Length(1, 100)
  state!: string;

  @ApiPropertyOptional({ default: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateClinicDto extends PartialType(CreateClinicDto, { skipNullProperties: false }) {}

export class ClinicDto extends PickType(CreateClinicDto, ['name', 'address', 'city', 'state']) {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000101' })
  id!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;
}

export class ClinicPageDto extends CatalogPageDto {
  @ApiProperty({ type: [ClinicDto] })
  items!: ClinicDto[];
}
