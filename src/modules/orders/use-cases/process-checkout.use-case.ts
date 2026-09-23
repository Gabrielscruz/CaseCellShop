import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  ORDER_REPOSITORY,
  IOrderRepository,
} from '../../../core/orders/order.repository.interface';
import {
  PRODUCT_REPOSITORY,
  IProductRepository,
} from '../../../core/products/product.repository.interface';
import { RedisCacheService } from '../../../infra/cache/redis-cache.service';
import { OrdersQueue } from '../../../infra/messaging/orders.queue';
import { MetricsService } from '../../../infra/observability/metrics.service';
import { StructuredLoggerService } from '../../../infra/observability/logger.service';
import { CheckoutDto } from '../dto/checkout.dto';

export interface CheckoutResult {
  orderId: string;
  status: string;
}

@Injectable()
export class ProcessCheckoutUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: IOrderRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepo: IProductRepository,
    private readonly cache: RedisCacheService,
    private readonly ordersQueue: OrdersQueue,
    private readonly metrics: MetricsService,
    private readonly logger: StructuredLoggerService,
  ) {}

  async execute(dto: CheckoutDto, idempotencyKey: string, correlationId: string): Promise<CheckoutResult> {
    // 1. Verificação de Idempotência
    const existingIdempotentData = await this.cache.getIdempotencyResult<CheckoutResult>(idempotencyKey);
    if (existingIdempotentData === 'PROCESSING') {
      this.logger.warn(`Requisição duplicada em andamento para idempotency-key ${idempotencyKey}`, {
        correlation_id: correlationId,
        idempotency_key: idempotencyKey,
      });
      throw new ConflictException('Requisição já em processamento. Por favor aguarde.');
    }

    if (existingIdempotentData && typeof existingIdempotentData === 'object') {
      this.logger.log(`Retornando resposta idempotente salva para ${idempotencyKey}`, {
        order_id: existingIdempotentData.orderId,
        correlation_id: correlationId,
        idempotency_key: idempotencyKey,
      });
      return existingIdempotentData;
    }

    // Trava de idempotência atômica no Redis (evita race condition no duplo clique)
    const acquiredIdempotency = await this.cache.acquireIdempotencyLock(idempotencyKey, 120);
    if (!acquiredIdempotency) {
      throw new ConflictException('Requisição simultânea concorrente com a mesma Idempotency-Key.');
    }

    // 2. Validação dos produtos e cálculo do total
    let totalAmount = 0;
    const validatedItems: { productId: string; quantity: number; unitPrice: number }[] = [];

    for (const item of dto.items) {
      const product = await this.productRepo.findById(item.productId);
      if (!product) {
        throw new NotFoundException(`Produto com ID ${item.productId} não encontrado.`);
      }
      totalAmount += product.price * item.quantity;
      validatedItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.price,
      });
    }

    // 3. Baixa Atômica Condicional de Estoque (Atomic Conditional Update)
    // UPDATE stock SET qty = qty - $1 WHERE product_id = $2 AND qty >= $1
    // Proíbe checagens simples de estoque em memória para eliminar race conditions e overselling.
    const decrementedProducts: { productId: string; quantity: number }[] = [];

    for (const item of validatedItems) {
      const success = await this.productRepo.decrementStockAtomic(item.productId, item.quantity);
      if (!success) {
        // Rollback compensatório dos itens anteriores deste mesmo pedido
        for (const dec of decrementedProducts) {
          await this.productRepo.incrementStockAtomic(dec.productId, dec.quantity);
        }

        this.metrics.checkoutStockoutRejectedTotal.inc({ product_id: item.productId });
        this.metrics.checkoutOrdersTotal.inc({ status: 'rejected' });
        this.logger.warn(`Estoque insuficiente para o produto ${item.productId}`, {
          product_id: item.productId,
          quantity_requested: item.quantity,
          correlation_id: correlationId,
        });

        // Limpa a trava de idempotência para permitir que o cliente tente outro pedido
        await this.cache.del(`idempotency:${idempotencyKey}`);

        throw new ConflictException(`Estoque insuficiente para o produto ${item.productId}.`);
      }
      decrementedProducts.push({ productId: item.productId, quantity: item.quantity });
    }

    // Invalida cache de produtos para manter vitrine atualizada com o novo saldo
    await this.cache.del('catalog:page:1:limit:10');

    // 4. Criação do Pedido no Banco de Dados
    const orderId = uuidv4();
    await this.orderRepo.create({
      id: orderId,
      totalAmount,
      idempotencyKey,
      items: validatedItems,
    });

    // 5. Enfileiramento na Mensageria Assíncrona (BullMQ)
    await this.ordersQueue.addCheckoutJob({
      orderId,
      correlationId,
      items: validatedItems,
      totalAmount,
    });

    const result: CheckoutResult = {
      orderId,
      status: 'ACCEPTED',
    };

    // 6. Armazena o resultado de sucesso na chave de idempotência (24h)
    await this.cache.setIdempotencyResult(idempotencyKey, result, 86400);

    this.metrics.checkoutOrdersTotal.inc({ status: 'accepted' });
    this.logger.log(`Checkout aceito e enfileirado com sucesso: ${orderId}`, {
      order_id: orderId,
      correlation_id: correlationId,
      total_amount: totalAmount,
    });

    return result;
  }
}

