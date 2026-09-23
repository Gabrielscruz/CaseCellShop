import { ConflictException } from '@nestjs/common';
import { ProcessCheckoutUseCase } from '../src/modules/orders/use-cases/process-checkout.use-case';
import { IOrderRepository } from '../src/core/orders/order.repository.interface';
import { IProductRepository } from '../src/core/products/product.repository.interface';
import { RedisCacheService } from '../src/infra/cache/redis-cache.service';
import { OrdersQueue } from '../src/infra/messaging/orders.queue';
import { MetricsService } from '../src/infra/observability/metrics.service';
import { StructuredLoggerService } from '../src/infra/observability/logger.service';
import { Product } from '../src/core/products/product.entity';

describe('Teste de Concorrência e Blindagem contra Overselling (100 requisições simultâneas)', () => {
  let useCase: ProcessCheckoutUseCase;
  let currentStock: number;

  beforeEach(() => {
    currentStock = 10; // 10 unidades no estoque inicial

    const mockProduct: Product = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Capinha Silicone iPhone 15 Pro',
      description: 'Capinha top',
      price: 89.9,
      stockQty: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Simula o comportamento do Atomic Conditional Update do PostgreSQL:
    // UPDATE stock SET qty = qty - 1 WHERE id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' AND qty >= 1
    // Nenhuma race condition acontece porque a verificação e o decremento são indivisíveis
    const mockProductRepo: IProductRepository = {
      findPaginated: jest.fn(),
      findById: jest.fn().mockResolvedValue(mockProduct),
      decrementStockAtomic: jest.fn().mockImplementation(async (productId: string, quantity: number) => {
        if (currentStock >= quantity) {
          currentStock -= quantity;
          return true;
        }
        return false;
      }),
      incrementStockAtomic: jest.fn().mockImplementation(async (productId: string, quantity: number) => {
        currentStock += quantity;
        return true;
      }),
    };

    const mockOrderRepo: IOrderRepository = {
      create: jest.fn().mockImplementation(async (data) => ({
        ...data,
        status: 'ACCEPTED',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      updateStatus: jest.fn(),
    };

    const idempotencyStore = new Map<string, any>();
    const mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      acquireLock: jest.fn(),
      releaseLock: jest.fn(),
      acquireIdempotencyLock: jest.fn().mockImplementation(async (key: string) => {
        if (idempotencyStore.has(key)) return false;
        idempotencyStore.set(key, 'PROCESSING');
        return true;
      }),
      setIdempotencyResult: jest.fn().mockImplementation(async (key: string, val: any) => {
        idempotencyStore.set(key, val);
      }),
      getIdempotencyResult: jest.fn().mockImplementation(async (key: string) => {
        return idempotencyStore.get(key) || null;
      }),
    } as any;

    const mockOrdersQueue = {
      addCheckoutJob: jest.fn().mockResolvedValue('job-123'),
      getWaitingCount: jest.fn().mockResolvedValue(0),
    } as any;

    const mockMetrics = new MetricsService();
    const mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    useCase = new ProcessCheckoutUseCase(
      mockOrderRepo,
      mockProductRepo,
      mockCacheService,
      mockOrdersQueue,
      mockMetrics,
      mockLogger,
    );
  });

  it('deve aprovar rigorosamente 10 requisições e rejeitar 90 requisições por falta de estoque com saldo final 0', async () => {
    const totalRequests = 100;
    const checkoutPromises: Promise<any>[] = [];

    // Dispara 100 requisições simultâneas em paralelo via Promise.all
    for (let i = 0; i < totalRequests; i++) {
      const promise = useCase
        .execute(
          { items: [{ productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', quantity: 1 }] },
          `idempotency-key-client-${i}`,
          `correlation-id-${i}`,
        )
        .then((res) => ({ status: 'ACCEPTED', res }))
        .catch((err) => ({
          status: err instanceof ConflictException ? 'REJECTED' : 'ERROR',
          error: err.message,
        }));

      checkoutPromises.push(promise);
    }

    const results = await Promise.all(checkoutPromises);

    const acceptedCount = results.filter((r) => r.status === 'ACCEPTED').length;
    const rejectedCount = results.filter((r) => r.status === 'REJECTED').length;
    const errorCount = results.filter((r) => r.status === 'ERROR').length;

    // Asserções obrigatórias especificadas na Parte 1.A do desafio técnico
    expect(acceptedCount).toBe(10);
    expect(rejectedCount).toBe(90);
    expect(errorCount).toBe(0);
    expect(currentStock).toBe(0); // Zero Overselling comprovado matematicamente
  });
});

