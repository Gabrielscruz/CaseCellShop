import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { GetProductsUseCase } from './use-cases/get-products.use-case';

@Module({
  controllers: [ProductsController],
  providers: [GetProductsUseCase],
  exports: [GetProductsUseCase],
})
export class ProductsModule {}

