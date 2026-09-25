import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { connect, Channel, ChannelModel, ConsumeMessage } from 'amqplib'
import { StructuredLoggerService } from '../observability/logger.service'

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection: ChannelModel | null = null
  private channel: Channel | null = null
  private initPromise: Promise<Channel> | null = null

  readonly EXCHANGE_NAME = 'orders.exchange'
  readonly QUEUE_ORDERS = 'orders.process'
  readonly QUEUE_DLQ = 'orders.dlq'
  readonly ROUTING_KEY_ORDER_CREATED = 'order.created'
  readonly ROUTING_KEY_DLQ = 'orders.dlq'

  constructor(private readonly logger: StructuredLoggerService) {}

  async onModuleInit() {
    await this.getChannel()
  }

  async onModuleDestroy() {
    await this.disconnect()
  }

  async getChannel(): Promise<Channel> {
    if (this.channel) {
      return this.channel
    }

    if (!this.initPromise) {
      this.initPromise = this.connect()
    }

    return this.initPromise
  }

  async connect(): Promise<Channel> {
    if (this.channel) {
      return this.channel
    }

    const url = process.env.RABBITMQ_URL

    try {
      this.connection = await connect(url)
      this.channel = await this.connection.createChannel()

      await this.channel.assertExchange(this.EXCHANGE_NAME, 'direct', {
        durable: true,
      })

      await this.channel.assertQueue(this.QUEUE_DLQ, { durable: true })
      await this.channel.bindQueue(
        this.QUEUE_DLQ,
        this.EXCHANGE_NAME,
        this.ROUTING_KEY_DLQ,
      )

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

      await this.channel.prefetch(10)

      this.logger.log(
        'Conexão com RabbitMQ e topologia de filas estabelecidas com sucesso.',
      )

      return this.channel
    } catch (error) {
      this.logger.error('Falha ao conectar no RabbitMQ', undefined, {
        error: error.message,
      })
      this.initPromise = null
      throw error
    }
  }

  async publish<T>(routingKey: string, message: T): Promise<boolean> {
    try {
      const channel = await this.getChannel()
      const payload = Buffer.from(JSON.stringify(message))
      return channel.publish(this.EXCHANGE_NAME, routingKey, payload, {
        persistent: true,
        contentType: 'application/json',
        timestamp: Date.now(),
      })
    } catch (error) {
      this.logger.warn(
        `Falha ao publicar mensagem no RabbitMQ: ${error.message}`,
      )
      return false
    }
  }

  async consume<T>(
    queue: string,
    onMessage: (data: T, originalMessage: ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    try {
      const channel = await this.getChannel()

      await channel.consume(queue, async (msg) => {
        if (!msg) return

        try {
          const content = JSON.parse(msg.content.toString()) as T
          await onMessage(content, msg)
          channel.ack(msg)
        } catch (error) {
          this.logger.error(
            `Erro no processamento da mensagem da fila "${queue}": ${error.message}`,
            undefined,
            { error: error.message },
          )
          channel.nack(msg, false, false)
        }
      })

      this.logger.log(`Consumidor registrado com sucesso na fila "${queue}".`)
    } catch (error) {
      this.logger.error(
        `Falha ao registrar consumidor na fila "${queue}": ${error.message}`,
        undefined,
        { error: error.message },
      )
    }
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
      // noop
    }
  }
}
