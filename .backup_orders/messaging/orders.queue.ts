import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../cache/redis.client';
import { MetricsService } from '../observability/metrics.service';
import { StructuredLoggerService } from '../observability/logger.service';

export interface CheckoutJobData {
  orderId: string;
  correlationId: string;
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
  }[];
  totalAmount: number;
}

@Injectable()
export class OrdersQueue implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly metrics: MetricsService,
    private readonly logger: StructuredLoggerService,
  ) {
    const queueName = process.env.ORDERS_QUEUE_NAME || 'orders-checkout-queue';

    this.queue = new Queue(queueName, {
      connection: this.redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 500, // delay base 500ms
        },
        removeOnComplete: 100,
        removeOnFail: false, // Mantém jobs com falha para inspeção de DLQ
      },
    });
  }

  async addCheckoutJob(data: CheckoutJobData): Promise<string> {
    const job = await this.queue.add('process-checkout', data, {
      jobId: data.orderId,
    });

    this.metrics.queueMessagesPushedTotal.inc();
    this.logger.log(`Pedido ${data.orderId} enfileirado para processamento assíncrono.`, {
      order_id: data.orderId,
      correlation_id: data.correlationId,
      queue_name: this.queue.name,
    });

    return job.id || data.orderId;
  }

  async getWaitingCount(): Promise<number> {
    const count = await this.queue.getWaitingCount();
    this.metrics.queueMessagesWaiting.set(count);
    return count;
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}

