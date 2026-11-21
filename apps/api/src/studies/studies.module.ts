import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../persistence/prisma.module';
import { StudiesController } from './studies.controller';
import { StudiesService } from './studies.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [StudiesController],
  providers: [StudiesService],
})
export class StudiesModule {}
