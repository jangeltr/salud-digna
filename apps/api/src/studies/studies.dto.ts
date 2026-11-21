import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { CatalogPageDto, trimText } from '../catalogs/catalog-query.dto';

const PRICE_PATTERN = /^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/;

export class CreateStudyDto {
  @ApiProperty({ minLength: 1, maxLength: 120, example: 'Demo Glucosa' })
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000, example: 'Estudio sintético de demostración.' })
  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiProperty({ type: String, pattern: PRICE_PATTERN.source, example: '120.00' })
  @IsString()
  @Matches(PRICE_PATTERN)
  price!: string;

  @ApiPropertyOptional({ default: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStudyDto extends PartialType(CreateStudyDto, { skipNullProperties: false }) {}

export class StudyDto extends PickType(CreateStudyDto, ['name']) {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000201' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Estudio sintético de demostración.' })
  description!: string | null;

  @ApiProperty({ type: String, pattern: '^[0-9]+\\.[0-9]{2}$', example: '120.00' })
  price!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;
}

export class StudyPageDto extends CatalogPageDto {
  @ApiProperty({ type: [StudyDto] })
  items!: StudyDto[];
}
