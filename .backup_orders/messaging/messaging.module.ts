import { Global, Module } from '@nestjs/common';
import { OrdersQueue } from './orders.queue';
import { OrdersProcessor } from './orders.processor';

@Global()
@Module({
  providers: [OrdersQueue, OrdersProcessor],
  exports: [OrdersQueue],
})
export class MessagingModule {}

