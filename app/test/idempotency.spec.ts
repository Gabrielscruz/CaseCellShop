import { ConflictError } from '../src/core/errors/conflict.error'
import { OrdersService } from '../src/modules/orders/orders.service'
import { IOrderRepository } from '../src/core/orders/order.repository.interface'
import { IProductRepository } from '../src/core/products/product.repository.interface'
import { Product } from '../src/core/products/product.entity'
import { OrderStatus } from '../src/core/orders/order.entity'

describe('Idempotência no Checkout (Tolerância a Duplo Clique e Retries)', () => {
  let service: OrdersService
  let idempotencyStore: Map<string, any>
  let stock = 10

  beforeEach(() => {
    idempotencyStore = new Map<string, any>()
    stock = 10

    const mockProduct: Product = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Capa Teste',
      description: 'Desc',
      price: 50,
      stockQty: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockProductRepo: IProductRepository = {
      findPaginated: jest.fn(),
      findById: jest.fn().mockResolvedValue(mockProduct),
      decrementStockAtomic: jest.fn().mockImplementation(async () => {
        if (stock >= 1) {
          stock -= 1
          return true
        }
        return false
      }),
      incrementStockAtomic: jest.fn(),
    }

    const mockOrderRepo: IOrderRepository = {
      create: jest.fn().mockImplementation(async (data) => ({
        id: 'ord-123',
        ...data,
        status: OrderStatus.ACCEPTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      updateStatus: jest.fn(),
    }

    const mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      acquireIdempotencyLock: jest
        .fn()
        .mockImplementation(async (key: string) => {
          if (idempotencyStore.has(key)) return false
          idempotencyStore.set(key, 'PROCESSING')
          return true
        }),
      setIdempotencyResult: jest
        .fn()
        .mockImplementation(async (key: string, val: any) => {
          idempotencyStore.set(key, val)
        }),
      getIdempotencyResult: jest
        .fn()
        .mockImplementation(async (key: string) => {
          return idempotencyStore.get(key) || null
        }),
    } as any

    const mockRabbitMQ = {
      publish: jest.fn().mockResolvedValue(true),
      ROUTING_KEY_ORDER_CREATED: 'order.created',
    } as any

    const mockMetrics = {
      checkoutOrdersTotal: { inc: jest.fn() },
      checkoutStockoutRejectedTotal: { inc: jest.fn() },
      queueMessagesPushedTotal: { inc: jest.fn() },
    } as any

    const mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any

    service = new OrdersService(
      mockOrderRepo,
      mockProductRepo,
      mockCacheService,
      mockRabbitMQ,
      mockLogger,
      mockMetrics,
    )
  })

  it('deve retornar a mesma resposta salva e não descontar estoque novamente quando um retry é executado com a mesma Idempotency-Key', async () => {
    const key = 'user-retry-key-uuid'
    const dto = {
      customerId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      items: [
        { productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', quantity: 1 },
      ],
    }

    const firstCall = await service.processCheckout(dto, key, 'corr-1')
    expect(firstCall.status).toBe('ACCEPTED')
    expect(stock).toBe(9)

    const secondCall = await service.processCheckout(dto, key, 'corr-2')
    expect(secondCall.orderId).toBe(firstCall.orderId)
    expect(secondCall.status).toBe('ACCEPTED')
    expect(stock).toBe(9)
  })

  it('deve rejeitar com ConflictException se duas requisições simultâneas chegarem com a mesma Idempotency-Key enquanto uma está PROCESSING', async () => {
    const key = 'double-click-key'
    idempotencyStore.set(key, 'PROCESSING')

    await expect(
      service.processCheckout(
        {
          customerId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
          items: [
            { productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', quantity: 1 },
          ],
        },
        key,
        'corr-3',
      ),
    ).rejects.toThrow(ConflictError)

    expect(stock).toBe(10)
  })
})
