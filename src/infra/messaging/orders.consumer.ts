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

    await this.orderRepo.updateStatus(orderId, OrderStatus.PROCESSING)

    try {
      // Simulação do faturamento no ERP externo com resiliência
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

      // Propaga o erro para o RabbitMQ encaminhar para a DLQ
      throw error
    }
  }

  private async simulateErpBilling(orderId: string): Promise<void> {
    // Simula chamada HTTP externa rápida (50ms)
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Se o orderId contiver "fail-erp", força uma falha para testes de DLQ e compensação
    if (orderId.includes('fail-erp')) {
      throw new Error('ERP Gateway: Falha de comunicação ou cartão recusado')
    }
  }
}

