import { ConflictException } from '@nestjs/common';
import { ProcessCheckoutUseCase } from '../src/modules/orders/use-cases/process-checkout.use-case';
import { IOrderRepository } from '../src/core/orders/order.repository.interface';
import { IProductRepository } from '../src/core/products/product.repository.interface';
import { MetricsService } from '../src/infra/observability/metrics.service';
import { Product } from '../src/core/products/product.entity';

describe('Idempotência no Checkout (Tolerância a Duplo Clique e Retries)', () => {
  let useCase: ProcessCheckoutUseCase;
  let idempotencyStore: Map<string, any>;
  let stock = 10;

  beforeEach(() => {
    idempotencyStore = new Map<string, any>();
    stock = 10;

    const mockProduct: Product = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Capa Teste',
      description: 'Desc',
      price: 50,
      stockQty: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockProductRepo: IProductRepository = {
      findPaginated: jest.fn(),
      findById: jest.fn().mockResolvedValue(mockProduct),
      decrementStockAtomic: jest.fn().mockImplementation(async () => {
        if (stock >= 1) {
          stock -= 1;
          return true;
        }
        return false;
      }),
      incrementStockAtomic: jest.fn(),
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

    const mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
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
      addCheckoutJob: jest.fn().mockResolvedValue('job-1'),
      getWaitingCount: jest.fn().mockResolvedValue(0),
    } as any;

    useCase = new ProcessCheckoutUseCase(
      mockOrderRepo,
      mockProductRepo,
      mockCacheService,
      mockOrdersQueue,
      new MetricsService(),
      { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    );
  });

  it('deve retornar a mesma resposta salva e não descontar estoque novamente quando um retry é executado com a mesma Idempotency-Key', async () => {
    const key = 'user-retry-key-uuid';
    const dto = { items: [{ productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', quantity: 1 }] };

    // Primeira chamada: aceita
    const firstCall = await useCase.execute(dto, key, 'corr-1');
    expect(firstCall.status).toBe('ACCEPTED');
    expect(stock).toBe(9); // 1 descontado

    // Segunda chamada (retry por perda de conexão): retorna o resultado anterior sem descontar de novo
    const secondCall = await useCase.execute(dto, key, 'corr-2');
    expect(secondCall.orderId).toBe(firstCall.orderId);
    expect(secondCall.status).toBe('ACCEPTED');
    expect(stock).toBe(9); // Estoque permaneceu 9 intacto!
  });

  it('deve rejeitar com ConflictException se duas requisições simultâneas chegarem com a mesma Idempotency-Key enquanto uma está PROCESSING', async () => {
    const key = 'double-click-key';
    idempotencyStore.set(key, 'PROCESSING');

    await expect(
      useCase.execute({ items: [{ productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', quantity: 1 }] }, key, 'corr-3'),
    ).rejects.toThrow(ConflictException);

    expect(stock).toBe(10); // Nenhum estoque baixado
  });
});

