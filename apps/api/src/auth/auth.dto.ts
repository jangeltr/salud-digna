import { ApiExtraModels, getSchemaPath, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { UserRole } from '../generated/prisma/enums';
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, normalizeEmail } from './credentials';

function trimIfString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

class EmailDto {
  @ApiProperty({ format: 'email', maxLength: MAX_EMAIL_LENGTH, example: 'paciente@example.test' })
  @Transform(({ value }) => typeof value === 'string' ? normalizeEmail(value) : value)
  @IsEmail()
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;
}

export class RegisterDto extends EmailDto {
  @ApiProperty({ minLength: 1, maxLength: 100, example: 'Alex' })
  @Transform(({ value }) => trimIfString(value))
  @IsString()
  @Length(1, 100)
  firstName!: string;

  @ApiProperty({ minLength: 1, maxLength: 100, example: 'Ejemplo' })
  @Transform(({ value }) => trimIfString(value))
  @IsString()
  @Length(1, 100)
  lastName!: string;

  @ApiProperty({
    format: 'password',
    writeOnly: true,
    minLength: MIN_PASSWORD_LENGTH,
    maxLength: MAX_PASSWORD_LENGTH,
  })
  @IsString()
  @Length(MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH)
  password!: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 32, example: '+525500000000' })
  @Transform(({ value }) => trimIfString(value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 32)
  phone?: string;
}

export class LoginDto extends EmailDto {
  @ApiProperty({ format: 'password', writeOnly: true, minLength: 1, maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}

export class PublicUserDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  id!: string;

  @ApiProperty({ format: 'email', example: 'paciente@example.test' })
  email!: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: UserRole.PATIENT })
  role!: UserRole;
}

class PatientProfileDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000002' })
  id!: string;

  @ApiProperty({ example: 'Alex' })
  firstName!: string;

  @ApiProperty({ example: 'Ejemplo' })
  lastName!: string;

  @ApiProperty({ type: String, format: 'email', nullable: true, example: 'paciente@example.test' })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  phone!: string | null;
}

@ApiExtraModels(PatientProfileDto)
export class AccountDto extends PublicUserDto {
  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, example: '00000000-0000-4000-8000-000000000002' })
  patientId!: string | null;

  @ApiProperty({ oneOf: [{ $ref: getSchemaPath(PatientProfileDto) }, { type: 'object', nullable: true, enum: [null] }] })
  patient!: PatientProfileDto | null;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT firmado', example: '<jwt>' })
  accessToken!: string;

  @ApiProperty({ enum: ['Bearer'], example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ description: 'Vigencia en segundos', example: 1800 })
  expiresIn!: number;

  @ApiProperty({ type: PublicUserDto })
  user!: PublicUserDto;
}
