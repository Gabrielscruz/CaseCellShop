import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { ProcessCheckoutUseCase } from './use-cases/process-checkout.use-case';
import { GetOrderStatusUseCase } from './use-cases/get-order-status.use-case';

@Module({
  controllers: [OrdersController],
  providers: [ProcessCheckoutUseCase, GetOrderStatusUseCase],
  exports: [ProcessCheckoutUseCase, GetOrderStatusUseCase],
})
export class OrdersModule {}

