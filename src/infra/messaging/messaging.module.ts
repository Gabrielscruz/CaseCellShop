import { Global, Module } from '@nestjs/common'
import { RabbitMQService } from './rabbitmq.service'
import { OrdersConsumer } from './orders.consumer'

@Global()
@Module({
  providers: [RabbitMQService, OrdersConsumer],
  exports: [RabbitMQService],
})
export class MessagingModule {}

