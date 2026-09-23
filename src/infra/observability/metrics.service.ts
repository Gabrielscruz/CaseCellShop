import { Injectable } from '@nestjs/common'
import * as client from 'prom-client'

@Injectable()
export class MetricsService {
  private readonly registry: client.Registry

  // Counters
  public readonly cacheRequestsTotal: client.Counter<'status'>
  public readonly checkoutOrdersTotal: client.Counter<'status'>
  public readonly checkoutStockoutRejectedTotal: client.Counter<'product_id'>
  public readonly queueMessagesPushedTotal: client.Counter<string>
  public readonly queueMessagesDlqTotal: client.Counter<string>
  public readonly erpErrorsTotal: client.Counter<'endpoint' | 'status_code'>

  // Histograms
  public readonly httpRequestDurationSeconds: client.Histogram<
    'route' | 'method' | 'status_code'
  >

  public readonly erpCallDurationSeconds: client.Histogram<'status'>

  // Gauges
  public readonly queueMessagesWaiting: client.Gauge<string>

  constructor() {
    this.registry = new client.Registry()
    client.collectDefaultMetrics({ register: this.registry })

    this.cacheRequestsTotal = new client.Counter({
      name: 'cache_requests_total',
      help: 'Total de requisições enviadas ao cache Redis',
      labelNames: ['status'],
      registers: [this.registry],
    })

    this.checkoutOrdersTotal = new client.Counter({
      name: 'checkout_orders_total',
      help: 'Total de pedidos processados no checkout por status',
      labelNames: ['status'],
      registers: [this.registry],
    })

    this.checkoutStockoutRejectedTotal = new client.Counter({
      name: 'checkout_stockout_rejected_total',
      help: 'Total de compras rejeitadas por falta de estoque',
      labelNames: ['product_id'],
      registers: [this.registry],
    })

    this.queueMessagesPushedTotal = new client.Counter({
      name: 'queue_messages_pushed_total',
      help: 'Total de mensagens enfileiradas para processamento assíncrono',
      registers: [this.registry],
    })

    this.queueMessagesDlqTotal = new client.Counter({
      name: 'queue_messages_dlq_total',
      help: 'Total de mensagens enviadas para a Dead Letter Queue (DLQ)',
      registers: [this.registry],
    })

    this.erpErrorsTotal = new client.Counter({
      name: 'erp_errors_total',
      help: 'Total de falhas nas chamadas à API do ERP simulado',
      labelNames: ['endpoint', 'status_code'],
      registers: [this.registry],
    })

    this.httpRequestDurationSeconds = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duração das requisições HTTP em segundos',
      labelNames: ['route', 'method', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    })

    this.erpCallDurationSeconds = new client.Histogram({
      name: 'erp_call_duration_seconds',
      help: 'Tempo de resposta da integração simulada com o ERP',
      labelNames: ['status'],
      buckets: [0.05, 0.1, 0.2, 0.5, 1, 2],
      registers: [this.registry],
    })

    this.queueMessagesWaiting = new client.Gauge({
      name: 'queue_messages_waiting',
      help: 'Volume atual de mensagens em espera na fila',
      registers: [this.registry],
    })
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics()
  }

  getContentType(): string {
    return this.registry.contentType
  }
}
