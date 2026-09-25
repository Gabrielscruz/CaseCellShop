import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { RabbitMQService } from './rabbitmq.service'
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../core/orders/order.repository.interface'
import {
  IProductRepository,
  PRODUCT_REPOSITORY,
} from '../../core/products/product.repository.interface'
import { OrderStatus } from '../../core/orders/order.entity'
import { StructuredLoggerService } from '../observability/logger.service'
import { MetricsService } from '../observability/metrics.service'
import { delay } from '../../utils/time.util'

export interface OrderQueueMessage {
  orderId: string
  items: {
    productId: string
    quantity: number
  }[]
  correlationId?: string
}
@Injectable()
export class OrdersConsumer implements OnModuleInit {
  private readonly STATUS_TRANSITION_DELAY_MS = 30000 // 30 segundos para simular processamento realista entre transições de status
  constructor(
    private readonly rabbitmq: RabbitMQService,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepo: IOrderRepository,
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepo: IProductRepository,
    private readonly logger: StructuredLoggerService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit() {
    await this.startConsumer()
  }

  private async startConsumer() {
    await this.rabbitmq.consume<OrderQueueMessage>(
      this.rabbitmq.QUEUE_ORDERS,
      async (message) => {
        await this.processOrder(message)
      },
    )
  }

  async processOrder(message: OrderQueueMessage): Promise<void> {
    const { orderId, items, correlationId } = message

    this.logger.log(`Iniciando faturamento assíncrono do pedido ${orderId}`, {
      orderId,
      correlationId,
    })

    await delay(this.STATUS_TRANSITION_DELAY_MS)
    await this.orderRepo.updateStatus(orderId, OrderStatus.PROCESSING)
    this.logger.log(`Pedido ${orderId} atualizado para status PROCESSING.`, {
      orderId,
      status: 'PROCESSING',
    })

    try {
      await this.simulateErpBilling(orderId)

      await this.orderRepo.updateStatus(orderId, OrderStatus.BILLED)
      this.metrics.checkoutOrdersTotal.inc({ status: 'billed' })

      this.logger.log(
        `Pedido ${orderId} faturado com sucesso no ERP. Status atualizado para BILLED.`,
        { orderId, status: 'BILLED' },
      )
    } catch (error) {
      this.logger.error(
        `Falha irrecuperável no faturamento do pedido ${orderId}: ${error.message}. Executando transação compensatória de estorno de estoque...`,
        undefined,
        { orderId, error: error.message },
      )

      // Transação Compensatória (Saga): Estorna o estoque reservado
      for (const item of items) {
        try {
          await this.productRepo.incrementStockAtomic(
            item.productId,
            item.quantity,
          )
        } catch (stockError) {
          this.logger.error(
            `Falha ao estornar estoque do produto ${item.productId}: ${stockError.message}`,
            undefined,
            { productId: item.productId, orderId },
          )
        }
      }

      await this.orderRepo.updateStatus(
        orderId,
        OrderStatus.FAILED,
        error.message,
      )
      this.metrics.checkoutOrdersTotal.inc({ status: 'failed' })
      this.metrics.queueMessagesDlqTotal.inc()

      // Propaga o erro para o RabbitMQ encaminhar para a DLQ
      throw error
    }
  }

  private async simulateErpBilling(orderId: string): Promise<void> {
    await delay(this.STATUS_TRANSITION_DELAY_MS)

    if (orderId.includes('fail-erp')) {
      throw new Error('ERP Gateway: Communication failure or card declined')
    }
  }
}
