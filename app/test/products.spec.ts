import { InvalidCursorError } from '../src/core/errors/bad-request.error'
import { ProductsService } from '../src/modules/products/products.service'
import {
  CursorPaginatedProducts,
  IProductRepository,
} from '../src/core/products/product.repository.interface'
import { RedisCacheService } from '../src/infra/cache/redis-cache.service'

describe('ProductsService (Clean Architecture & SOLID)', () => {
  let service: ProductsService
  let mockProductRepo: jest.Mocked<IProductRepository>
  let mockCacheService: jest.Mocked<RedisCacheService>

  beforeEach(() => {
    mockProductRepo = {
      findPaginated: jest.fn(),
      findById: jest.fn(),
      decrementStockAtomic: jest.fn(),
      incrementStockAtomic: jest.fn(),
    }

    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      acquireLock: jest.fn(),
      releaseLock: jest.fn(),
      acquireIdempotencyLock: jest.fn(),
      setIdempotencyResult: jest.fn(),
      getIdempotencyResult: jest.fn(),
      getOrSetWithFallback: jest.fn(),
    } as any

    service = new ProductsService(mockProductRepo, mockCacheService)
  })

  it('deve delegar a busca ao RedisCacheService usando chave de cache e limit corretos', async () => {
    const mockResult = {
      data: {
        items: [
          {
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            name: 'Capinha Silicone iPhone 15 Pro',
            description: 'Top',
            price: 89.9,
            stockQty: 10,
            createdAt: new Date('2026-09-22T20:00:00.000Z'),
            updatedAt: new Date('2026-09-22T20:00:00.000Z'),
          },
        ],
        nextCursor: null,
        hasMore: false,
        limit: 1000,
      },
      cacheStatus: 'HIT' as const,
    }

    mockCacheService.getOrSetWithFallback.mockResolvedValueOnce(mockResult)

    const result = await service.findAll()

    expect(result).toEqual(mockResult)
    expect(mockCacheService.getOrSetWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'catalog:cursor:first:limit:1000',
        ttlSeconds: 30,
        fallbackTtlSeconds: 86400,
      }),
    )
  })

  it('deve decodificar o cursor Base64URL e repassar ao loader do repositório', async () => {
    const cursorDate = '2026-09-22T19:30:00.000Z'
    const cursorId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
    const rawCursor = Buffer.from(
      JSON.stringify({ createdAt: cursorDate, id: cursorId }),
    ).toString('base64url')

    mockCacheService.getOrSetWithFallback.mockImplementation(
      async (options) => {
        const data = await options.loader()
        return { data, cacheStatus: 'MISS' }
      },
    )

    const dbData: CursorPaginatedProducts = {
      items: [],
      nextCursor: null,
      hasMore: false,
      limit: 1000,
    }
    mockProductRepo.findPaginated.mockResolvedValueOnce(dbData)

    const result = await service.findAll(1000, rawCursor)

    expect(result.cacheStatus).toBe('MISS')
    expect(mockProductRepo.findPaginated).toHaveBeenCalledWith({
      limit: 1000,
      cursor: {
        createdAt: new Date(cursorDate),
        id: cursorId,
      },
    })
  })

  it('deve lançar InvalidCursorError se o cursor de paginação for inválido ou corrompido', async () => {
    await expect(
      service.findAll(1000, 'cursor-totalmente-invalido'),
    ).rejects.toThrow(InvalidCursorError)

    expect(mockCacheService.getOrSetWithFallback).not.toHaveBeenCalled()
  })

  it('deve repassar findById diretamente para o repositório', async () => {
    const mockProduct = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Capinha MagSafe',
      description: 'Premium',
      price: 120,
      stockQty: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockProductRepo.findById.mockResolvedValueOnce(mockProduct)

    const result = await service.findById(mockProduct.id)
    expect(result).toEqual(mockProduct)
    expect(mockProductRepo.findById).toHaveBeenCalledWith(mockProduct.id)
  })
})
