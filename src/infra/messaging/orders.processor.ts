import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../cache/redis.client';
import { CheckoutJobData } from './orders.queue';
import { ORDER_REPOSITORY, IOrderRepository } from '../../core/orders/order.repository.interface';
import { PRODUCT_REPOSITORY, IProductRepository } from '../../core/products/product.repository.interface';
import { OrderStatus } from '../../core/orders/order.entity';
import { MetricsService } from '../observability/metrics.service';
import { StructuredLoggerService } from '../observability/logger.service';

@Injectable()
export class OrdersProcessor implements OnModuleInit, OnModuleDestroy {
  private worker: Worker;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: IOrderRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepo: IProductRepository,
    private readonly metrics: MetricsService,
    private readonly logger: StructuredLoggerService,
  ) {}

  onModuleInit() {
    const queueName = process.env.ORDERS_QUEUE_NAME || 'orders-checkout-queue';

    this.worker = new Worker(
      queueName,
      async (job: Job<CheckoutJobData>) => {
        return this.processOrder(job);
      },
      {
        connection: this.redis,
        concurrency: 5,
      },
    );

    this.worker.on('failed', async (job, err) => {
      if (!job) return;
      const data = job.data as CheckoutJobData;
      const isFinalFailure = job.attemptsMade >= (job.opts.attempts || 3);

      this.logger.warn(`Tentativa ${job.attemptsMade} falhou para o pedido ${data.orderId}: ${err.message}`, {
        order_id: data.orderId,
        correlation_id: data.correlationId,
        attempt: job.attemptsMade,
      });

      if (isFinalFailure) {
        this.metrics.queueMessagesDlqTotal.inc();
        this.metrics.checkoutOrdersTotal.inc({ status: 'failed' });

        this.logger.error(
          `Pedido ${data.orderId} falhou definitivamente após ${job.attemptsMade} tentativas. Executando SAGA compensatória (estorno de estoque)...`,
          err.stack,
          {
            order_id: data.orderId,
            correlation_id: data.correlationId,
            saga_step: 'compensation',
          },
        );

        // 1. Atualizar status para FAILED
        await this.orderRepo.updateStatus(data.orderId, OrderStatus.FAILED, err.message);

        // 2. Transação compensatória: Devolver o estoque que havia sido reservado no checkout
        for (const item of data.items) {
          await this.productRepo.incrementStockAtomic(item.productId, item.quantity);
        }

        this.logger.log(`Compensação do pedido ${data.orderId} concluída. Estoque estornado com sucesso.`, {
          order_id: data.orderId,
          correlation_id: data.correlationId,
          saga_step: 'compensation_completed',
        });
      }
    });

    this.worker.on('completed', (job) => {
      const data = job.data as CheckoutJobData;
      this.metrics.checkoutOrdersTotal.inc({ status: 'billed' });
      this.logger.log(`Pedido ${data.orderId} processado e faturado com sucesso pelo worker.`, {
        order_id: data.orderId,
        correlation_id: data.correlationId,
        order_status: OrderStatus.BILLED,
      });
    });
  }

  private async processOrder(job: Job<CheckoutJobData>) {
    const { orderId, correlationId, items } = job.data;

    this.logger.log(`Iniciando faturamento assíncrono para o pedido ${orderId}`, {
      order_id: orderId,
      correlation_id: correlationId,
      attempt: job.attemptsMade + 1,
    });

    // 1. Atualiza status do pedido para PROCESSING
    await this.orderRepo.updateStatus(orderId, OrderStatus.PROCESSING);

    // 2. Simula comunicação com a API do ERP Legado
    const startTime = Date.now();
    await this.simulateErpBillingCall(orderId, correlationId);
    const duration = (Date.now() - startTime) / 1000;
    this.metrics.erpCallDurationSeconds.observe({ status: 'success' }, duration);

    // 3. Atualiza status do pedido para BILLED
    await this.orderRepo.updateStatus(orderId, OrderStatus.BILLED);

    return { orderId, status: OrderStatus.BILLED };
  }

  /**
   * Simula chamada externa com latência controlada e taxa de timeout/retry transitória
   */
  private async simulateErpBillingCall(orderId: string, correlationId: string): Promise<void> {
    // Latência do ERP (entre 100ms e 300ms)
    const simulatedLatencyMs = Math.floor(Math.random() * 200) + 100;
    await new Promise((resolve) => setTimeout(resolve, simulatedLatencyMs));

    // Se a requisição contiver 'fail-erp', forçamos erro para testar DLQ e SAGA compensatória
    if (correlationId.includes('fail-erp') || orderId.includes('fail-erp')) {
      this.metrics.erpErrorsTotal.inc({ endpoint: '/erp/billing', status_code: '504' });
      throw new Error('ERP Gateway Timeout (HTTP 504) - Falha persistente na emissão da NF-e');
    }
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}

