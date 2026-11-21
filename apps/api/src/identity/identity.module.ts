import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../persistence/prisma.module';
import { IdentityDevelopmentAdapter } from './identity-development.adapter';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [IdentityController],
  providers: [IdentityService, IdentityDevelopmentAdapter],
  exports: [IdentityService],
})
export class IdentityModule {}
