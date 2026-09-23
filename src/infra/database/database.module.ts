import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaProductRepository } from './prisma-product.repository';
import { PrismaOrderRepository } from './prisma-order.repository';
import { PRODUCT_REPOSITORY } from '../../core/products/product.repository.interface';
import { ORDER_REPOSITORY } from '../../core/orders/order.repository.interface';

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: PRODUCT_REPOSITORY,
      useClass: PrismaProductRepository,
    },
    {
      provide: ORDER_REPOSITORY,
      useClass: PrismaOrderRepository,
    },
  ],
  exports: [PrismaService, PRODUCT_REPOSITORY, ORDER_REPOSITORY],
})
export class DatabaseModule {}
