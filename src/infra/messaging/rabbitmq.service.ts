import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common'
import * as amqp from 'amqplib'
import { StructuredLoggerService } from '../observability/logger.service'

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection: amqp.ChannelModel | null = null
  private channel: amqp.Channel | null = null

  readonly EXCHANGE_NAME = 'orders.exchange'
  readonly QUEUE_ORDERS = 'orders.process'
  readonly QUEUE_DLQ = 'orders.dlq'
  readonly ROUTING_KEY_ORDER_CREATED = 'order.created'
  readonly ROUTING_KEY_DLQ = 'orders.dlq'

  constructor(private readonly logger: StructuredLoggerService) {}

  async onModuleInit() {
    await this.connect()
  }

  async onModuleDestroy() {
    await this.disconnect()
  }

  async connect(): Promise<void> {
    const url =
      process.env.RABBITMQ_URL ||
      'amqp://casecellshop:casecellshop_pwd@localhost:5672'

    try {
      this.connection = await amqp.connect(url)
      this.channel = await this.connection.createChannel()

      // 1. Exchange direta e durável
      await this.channel.assertExchange(this.EXCHANGE_NAME, 'direct', {
        durable: true,
      })

      // 2. Dead Letter Queue (DLQ) para mensagens que falharem após retries
      await this.channel.assertQueue(this.QUEUE_DLQ, { durable: true })
      await this.channel.bindQueue(
        this.QUEUE_DLQ,
        this.EXCHANGE_NAME,
        this.ROUTING_KEY_DLQ,
      )

      // 3. Fila Principal de Pedidos com configuração de Dead Letter
      await this.channel.assertQueue(this.QUEUE_ORDERS, {
        durable: true,
        deadLetterExchange: this.EXCHANGE_NAME,
        deadLetterRoutingKey: this.ROUTING_KEY_DLQ,
      })
      await this.channel.bindQueue(
        this.QUEUE_ORDERS,
        this.EXCHANGE_NAME,
        this.ROUTING_KEY_ORDER_CREATED,
      )

      // Prefetch de 10 mensagens por worker para equilíbrio de carga
      await this.channel.prefetch(10)

      this.logger.log('Conexão com RabbitMQ e topologia de filas estabelecidas com sucesso.')
    } catch (error) {
      this.logger.error(
        'Falha ao conectar no RabbitMQ',
        undefined,
        { error: error.message },
      )
    }
  }

  async publish<T>(routingKey: string, message: T): Promise<boolean> {
    if (!this.channel) {
      this.logger.warn('Canal RabbitMQ não disponível para publicação.')
      return false
    }

    const payload = Buffer.from(JSON.stringify(message))
    return this.channel.publish(this.EXCHANGE_NAME, routingKey, payload, {
      persistent: true,
      contentType: 'application/json',
      timestamp: Date.now(),
    })
  }

  async consume<T>(
    queue: string,
    onMessage: (data: T, originalMessage: amqp.ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    if (!this.channel) {
      return
    }

    await this.channel.consume(queue, async (msg) => {
      if (!msg) return

      try {
        const content = JSON.parse(msg.content.toString()) as T
        await onMessage(content, msg)
        this.channel?.ack(msg)
      } catch (error) {
        this.logger.error(
          `Erro no processamento da mensagem da fila "${queue}": ${error.message}`,
          undefined,
          { error: error.message },
        )
        // Rejeita sem requeue caso atinja a DLQ ou requeue conforme política
        this.channel?.nack(msg, false, false)
      }
    })
  }

  async isHealthy(): Promise<boolean> {
    return !!this.connection && !!this.channel
  }

  private async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close()
      }
      if (this.connection) {
        await this.connection.close()
      }
    } catch {
      // Ignora erros no shutdown
    }
  }
}
