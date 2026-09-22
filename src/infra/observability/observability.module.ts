import { Global, Module } from '@nestjs/common';
import { StructuredLoggerService } from './logger.service';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [StructuredLoggerService, MetricsService],
  exports: [StructuredLoggerService, MetricsService],
})
export class ObservabilityModule {}

