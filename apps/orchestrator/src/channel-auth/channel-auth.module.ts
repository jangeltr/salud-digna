import { Module } from '@nestjs/common';
import { PrismaModule } from '../persistence/prisma.module';
import { ChannelAuthController } from './channel-auth.controller';
import { ChannelAuthGuard } from './channel-auth.guard';

@Module({
  imports: [PrismaModule],
  controllers: [ChannelAuthController],
  providers: [ChannelAuthGuard],
  exports: [ChannelAuthGuard, PrismaModule],
})
export class ChannelAuthModule {}
