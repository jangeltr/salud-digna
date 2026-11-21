import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { IdentityModule } from './identity/identity.module';
import { RequestsModule } from './requests/requests.module';
import { ClinicsModule } from './clinics/clinics.module';
import { StudiesModule } from './studies/studies.module';

@Module({ imports: [HealthModule, AuthModule, IdentityModule, RequestsModule, ClinicsModule, StudiesModule] })
export class AppModule {}
