import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ObservabilityModule } from './infra/observability/observability.module';
import { DatabaseModule } from './infra/database/database.module';
import { CacheModule } from './infra/cache/cache.module';
import { MessagingModule } from './infra/messaging/messaging.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CorrelationIdMiddleware } from './infra/observability/correlation-id.middleware';

@Module({
  imports: [
    ObservabilityModule,
    DatabaseModule,
    CacheModule,
    MessagingModule,
    ProductsModule,
    OrdersModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

