import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, Matches } from 'class-validator';
import { Channel } from '../generated/prisma/enums';

export const LINK_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export class RequestIdentityLinkDto {
  @ApiProperty({ enum: Channel, enumName: 'Channel', example: Channel.WHATSAPP })
  @IsEnum(Channel)
  provider!: Channel;
}

export class ConfirmIdentityLinkDto extends RequestIdentityLinkDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  @IsUUID()
  linkId!: string;

  @ApiProperty({ pattern: LINK_CODE_PATTERN.source, writeOnly: true, example: 'EjemploSintetico_00001' })
  @IsString()
  @Matches(LINK_CODE_PATTERN)
  code!: string;
}

export class IdentityLinkCodeDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000001' })
  linkId!: string;

  @ApiProperty({ pattern: LINK_CODE_PATTERN.source, example: 'EjemploSintetico_00001' })
  code!: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-21T19:05:00.000Z' })
  expiresAt!: Date;
}

export class LinkedIdentityDto {
  @ApiProperty({ format: 'uuid', example: '00000000-0000-4000-8000-000000000002' })
  id!: string;

  @ApiProperty({ enum: Channel, enumName: 'Channel', example: Channel.WHATSAPP })
  provider!: Channel;

  @ApiProperty({ example: 'sim:+12025550100' })
  externalId!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time', example: null })
  verifiedAt!: Date | null;

  @ApiProperty({ example: true, description: 'Identidad de demostración aislada de los canales reales.' })
  simulated!: boolean;
}
