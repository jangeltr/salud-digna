import { Module } from '@nestjs/common';
import { JourneyAccessModule } from '../journey-access/journey-access.module';
import { JourneyQueriesController } from './journey-queries.controller';
import { JourneyQueriesService } from './journey-queries.service';
import { JourneyWritesController } from './journey-writes.controller';
import { JourneyWritesService } from './journey-writes.service';

@Module({
  imports: [JourneyAccessModule],
  controllers: [JourneyQueriesController, JourneyWritesController],
  providers: [JourneyQueriesService, JourneyWritesService],
})
export class JourneyQueriesModule {}
