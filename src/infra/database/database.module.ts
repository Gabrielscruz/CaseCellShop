import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'
import { PrismaProductRepository } from './prisma-product.repository'
import { PRODUCT_REPOSITORY } from '../../core/products/product.repository.interface'

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: PRODUCT_REPOSITORY,
      useClass: PrismaProductRepository,
    },
  ],
  exports: [PrismaService, PRODUCT_REPOSITORY],
})
export class DatabaseModule {}
