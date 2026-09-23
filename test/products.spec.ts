import { BadRequestException } from '@nestjs/common'
import { ProductsService } from '../src/modules/products/products.service'
import {
  CursorPaginatedProducts,
  IProductRepository,
} from '../src/core/products/product.repository.interface'
import { RedisCacheService } from '../src/infra/cache/redis-cache.service'
import { StructuredLoggerService } from '../src/infra/observability/logger.service'

describe('ProductsService (Cursor-Based Pagination & Cache-Aside Redis)', () => {
  let service: ProductsService
  let mockProductRepo: jest.Mocked<IProductRepository>
  let mockCacheService: jest.Mocked<RedisCacheService>
  let mockLogger: jest.Mocked<StructuredLoggerService>

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
    } as any

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as any

    service = new ProductsService(mockProductRepo, mockCacheService, mockLogger)
  })

  it('deve retornar dados do cache (HIT) para o limite padrão de 1000 itens quando a chave existir', async () => {
    const cachedData: CursorPaginatedProducts = {
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
      nextCursor:
        'eyJjcmVhdGVkQXQiOiIyMDI2LTA5LTIyVDIwOjAwOjAwLjAwMFoiLCJpZCI6ImEwZWViYzk5LTljMGItNGVmOC1iYjZkLTZiYjliZDM4MGExMSJ9',
      hasMore: true,
      limit: 1000,
    }

    mockCacheService.get.mockResolvedValueOnce(cachedData)

    const result = await service.findAll()

    expect(result.cacheStatus).toBe('HIT')
    expect(result.data).toEqual(cachedData)
    expect(mockProductRepo.findPaginated).not.toHaveBeenCalled()
    expect(mockCacheService.get).toHaveBeenCalledWith(
      'catalog:cursor:first:limit:1000',
    )
  })

  it('deve consultar o banco de dados (MISS) na primeira página com limit 1000 default, salvar no cache e liberar lock', async () => {
    const dbData: CursorPaginatedProducts = {
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
      nextCursor:
        'eyJjcmVhdGVkQXQiOiIyMDI2LTA5LTIyVDIwOjAwOjAwLjAwMFoiLCJpZCI6ImEwZWViYzk5LTljMGItNGVmOC1iYjZkLTZiYjliZDM4MGExMSJ9',
      hasMore: true,
      limit: 1000,
    }

    mockCacheService.get.mockResolvedValueOnce(null)
    mockCacheService.acquireLock.mockResolvedValueOnce(true)
    mockProductRepo.findPaginated.mockResolvedValueOnce(dbData)

    const result = await service.findAll()

    expect(result.cacheStatus).toBe('MISS')
    expect(result.data).toEqual(dbData)
    expect(mockProductRepo.findPaginated).toHaveBeenCalledWith({
      limit: 1000,
      cursor: undefined,
    })
    expect(mockCacheService.set).toHaveBeenCalledWith(
      'catalog:cursor:first:limit:1000',
      dbData,
      30,
    )
    expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
      'lock:catalog:cursor:first:limit:1000',
    )
  })

  it('deve decodificar o cursor Base64 e consultar a próxima página de 1000 itens', async () => {
    const cursorDate = '2026-09-22T19:30:00.000Z'
    const cursorId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
    const rawCursor = Buffer.from(
      JSON.stringify({ createdAt: cursorDate, id: cursorId }),
    ).toString('base64url')

    const dbData: CursorPaginatedProducts = {
      items: [],
      nextCursor: null,
      hasMore: false,
      limit: 1000,
    }

    mockCacheService.get.mockResolvedValueOnce(null)
    mockCacheService.acquireLock.mockResolvedValueOnce(true)
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
    expect(mockCacheService.set).toHaveBeenCalledWith(
      `catalog:cursor:${rawCursor}:limit:1000`,
      dbData,
      30,
    )
  })

  it('deve lançar BadRequestException se o cursor for uma string corrompida', async () => {
    mockCacheService.get.mockResolvedValueOnce(null)
    mockCacheService.acquireLock.mockResolvedValueOnce(true)

    await expect(
      service.findAll(1000, 'cursor-invalido-corrompido'),
    ).rejects.toThrow(BadRequestException)
  })
})
