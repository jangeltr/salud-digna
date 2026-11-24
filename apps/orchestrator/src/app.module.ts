import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { JourneyQueriesModule } from './journeys/journey-queries.module';

@Module({ imports: [JourneyQueriesModule], controllers: [HealthController] })
export class AppModule {}
