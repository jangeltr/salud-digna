import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { IdentityModule } from './identity/identity.module';

@Module({ imports: [HealthModule, AuthModule, IdentityModule] })
export class AppModule {}
