import { Global, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, createPgPool } from './postgres.pool';
import { PgProductRepository } from './pg-product.repository';
import { PgOrderRepository } from './pg-order.repository';
import { PRODUCT_REPOSITORY } from '../../core/products/product.repository.interface';
import { ORDER_REPOSITORY } from '../../core/orders/order.repository.interface';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: createPgPool,
    },
    {
      provide: PRODUCT_REPOSITORY,
      useClass: PgProductRepository,
    },
    {
      provide: ORDER_REPOSITORY,
      useClass: PgOrderRepository,
    },
  ],
  exports: [PG_POOL, PRODUCT_REPOSITORY, ORDER_REPOSITORY],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor() {}

  async onModuleDestroy() {
    // Graceful shutdown do pool
  }
}

