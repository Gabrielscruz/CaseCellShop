import { ConflictException } from '@nestjs/common'
import { OrdersService } from '../src/modules/orders/orders.service'
import { IOrderRepository } from '../src/core/orders/order.repository.interface'
import { IProductRepository } from '../src/core/products/product.repository.interface'
import { Product } from '../src/core/products/product.entity'
import { OrderStatus } from '../src/core/orders/order.entity'

describe('Teste de Concorrência e Blindagem contra Overselling (100 requisições simultâneas)', () => {
  let service: OrdersService
  let currentStock: number

  beforeEach(() => {
    currentStock = 10

    const mockProduct: Product = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Capinha Silicone iPhone 15 Pro',
      description: 'Capinha top',
      price: 89.9,
      stockQty: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockProductRepo: IProductRepository = {
      findPaginated: jest.fn(),
      findById: jest.fn().mockResolvedValue(mockProduct),
      decrementStockAtomic: jest
        .fn()
        .mockImplementation(async (_productId: string, quantity: number) => {
          if (currentStock >= quantity) {
            currentStock -= quantity
            return true
          }
          return false
        }),
      incrementStockAtomic: jest
        .fn()
        .mockImplementation(async (_productId: string, quantity: number) => {
          currentStock += quantity
          return true
        }),
    }

    const mockOrderRepo: IOrderRepository = {
      create: jest.fn().mockImplementation(async (data) => ({
        id: `ord-${Math.random()}`,
        ...data,
        status: OrderStatus.ACCEPTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      updateStatus: jest.fn(),
    }

    const idempotencyStore = new Map<string, any>()
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

  it('deve aprovar rigorosamente 10 requisições e rejeitar 90 requisições por falta de estoque com saldo final 0', async () => {
    const totalRequests = 100
    const checkoutPromises: Promise<any>[] = []

    for (let i = 0; i < totalRequests; i++) {
      const promise = service
        .processCheckout(
          {
            customerId: `c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a${i < 10 ? '0' + i : i}`,
            items: [
              {
                productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                quantity: 1,
              },
            ],
          },
          `idempotency-key-client-${i}`,
          `correlation-id-${i}`,
        )
        .then((res) => ({ status: 'ACCEPTED', res }))
        .catch((err) => ({
          status: err instanceof ConflictException ? 'REJECTED' : 'ERROR',
          error: err.message,
        }))

      checkoutPromises.push(promise)
    }

    const results = await Promise.all(checkoutPromises)

    const accepted = results.filter((r) => r.status === 'ACCEPTED')
    const rejected = results.filter((r) => r.status === 'REJECTED')
    const errors = results.filter((r) => r.status === 'ERROR')

    expect(errors.length).toBe(0)
    expect(accepted.length).toBe(10)
    expect(rejected.length).toBe(90)
    expect(currentStock).toBe(0)
  })
})

