import { Inject, Injectable } from '@nestjs/common'
import * as crypto from 'crypto'
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../../core/orders/order.repository.interface'
import {
  IProductRepository,
  PRODUCT_REPOSITORY,
} from '../../core/products/product.repository.interface'
import { RedisCacheService } from '../../infra/cache/redis-cache.service'
import { RabbitMQService } from '../../infra/messaging/rabbitmq.service'
import { StructuredLoggerService } from '../../infra/observability/logger.service'
import { MetricsService } from '../../infra/observability/metrics.service'
import { CheckoutDto, CheckoutResponseDto } from './dto/checkout.dto'
import { Order } from '../../core/orders/order.entity'
import {
  ConflictError,
  DuplicateTransactionError,
  InsufficientStockError,
  TransactionInProgressError,
} from '../../core/errors/conflict.error'
import {
  NotFoundError,
  OrderNotFoundError,
  ProductNotFoundError,
} from '../../core/errors/not-found.error'

@Injectable()
export class OrdersService {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepo: IOrderRepository,
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepo: IProductRepository,
    private readonly cache: RedisCacheService,
    private readonly rabbitmq: RabbitMQService,
    private readonly logger: StructuredLoggerService,
    private readonly metrics: MetricsService,
  ) {}

  async processCheckout(
    dto: CheckoutDto,
    idempotencyKey?: string,
    correlationId?: string,
  ): Promise<CheckoutResponseDto> {
    const effectiveKey = idempotencyKey || this.generateFingerprint(dto)

    const lockAcquired = await this.cache.acquireIdempotencyLock(effectiveKey)

    if (!lockAcquired) {
      const existingResult =
        await this.cache.getIdempotencyResult<CheckoutResponseDto>(effectiveKey)

      if (existingResult === 'PROCESSING') {
        throw new TransactionInProgressError()
      }

      if (existingResult && typeof existingResult === 'object') {
        this.logger.log(
          `Checkout idempotente: retornando resultado existente para a chave "${effectiveKey}".`,
          { orderId: existingResult.orderId, correlationId },
        )
        return existingResult
      }

      throw new DuplicateTransactionError()
    }

    try {
      const orderItems: {
        productId: string
        quantity: number
        unitPrice: number
      }[] = []
      let totalAmount = 0

      for (const item of dto.items) {
        const product = await this.productRepo.findById(item.productId)
        if (!product) {
          throw new ProductNotFoundError(item.productId)
        }
        orderItems.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: product.price,
        })
        totalAmount += product.price * item.quantity
      }

      const deductedItems: { productId: string; quantity: number }[] = []
      for (const item of dto.items) {
        const success = await this.productRepo.decrementStockAtomic(
          item.productId,
          item.quantity,
        )

        if (!success) {
          for (const deducted of deductedItems) {
            await this.productRepo.incrementStockAtomic(
              deducted.productId,
              deducted.quantity,
            )
          }

          this.metrics.checkoutStockoutRejectedTotal.inc({
            product_id: item.productId,
          })
          throw new InsufficientStockError(item.productId)
        }

        deductedItems.push({
          productId: item.productId,
          quantity: item.quantity,
        })
      }

      const order = await this.orderRepo.create({
        totalAmount,
        idempotencyKey: effectiveKey,
        items: orderItems,
      })

      await this.rabbitmq.publish(this.rabbitmq.ROUTING_KEY_ORDER_CREATED, {
        orderId: order.id,
        items: dto.items,
        correlationId,
      })

      this.metrics.queueMessagesPushedTotal.inc()
      this.metrics.checkoutOrdersTotal.inc({ status: 'accepted' })

      const response: CheckoutResponseDto = {
        orderId: order.id,
        status: order.status,
      }

      await this.cache.setIdempotencyResult(effectiveKey, response)

      this.logger.log(`Pedido ${order.id} aceito com sucesso (HTTP 202).`, {
        orderId: order.id,
        correlationId,
        totalAmount,
      })

      return response
    } catch (error) {
      if (
        !(error instanceof ConflictError) &&
        !(error instanceof NotFoundError)
      ) {
        this.logger.error(
          `Erro inesperado durante o checkout: ${error.message}`,
          undefined,
          { error: error.message, correlationId },
        )
      }
      throw error
    }
  }

  async getOrderStatus(orderId: string): Promise<Order> {
    const order = await this.orderRepo.findById(orderId)
    if (!order) {
      throw new OrderNotFoundError(orderId)
    }
    return order
  }

  private generateFingerprint(dto: CheckoutDto): string {
    const sortedItems = [...dto.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    )
    const rawData = `${dto.customerId}:${JSON.stringify(sortedItems)}`
    return crypto.createHash('sha256').update(rawData).digest('hex')
  }
}
