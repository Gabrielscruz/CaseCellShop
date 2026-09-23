import { GetProductsUseCase } from '../src/modules/products/use-cases/get-products.use-case';
import { IProductRepository } from '../src/core/products/product.repository.interface';
import { RedisCacheService } from '../src/infra/cache/redis-cache.service';
import { StructuredLoggerService } from '../src/infra/observability/logger.service';

describe('GetProductsUseCase (Cache-Aside & Prevenção de Cache Stampede)', () => {
  let useCase: GetProductsUseCase;
  let mockProductRepo: jest.Mocked<IProductRepository>;
  let mockCacheService: jest.Mocked<RedisCacheService>;
  let mockLogger: jest.Mocked<StructuredLoggerService>;

  beforeEach(() => {
    mockProductRepo = {
      findPaginated: jest.fn(),
      findById: jest.fn(),
      decrementStockAtomic: jest.fn(),
      incrementStockAtomic: jest.fn(),
    };

    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      acquireLock: jest.fn(),
      releaseLock: jest.fn(),
      acquireIdempotencyLock: jest.fn(),
      setIdempotencyResult: jest.fn(),
      getIdempotencyResult: jest.fn(),
    } as any;

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as any;

    useCase = new GetProductsUseCase(mockProductRepo, mockCacheService, mockLogger);
  });

  it('deve retornar dados do cache (HIT) sem consultar o banco quando a chave existir', async () => {
    const cachedData = {
      items: [
        {
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          name: 'Capa Silicone iPhone 15',
          description: 'Top',
          price: 89.9,
          stockQty: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };

    mockCacheService.get.mockResolvedValueOnce(cachedData);

    const result = await useCase.execute(1, 10);

    expect(result.cacheStatus).toBe('HIT');
    expect(result.data).toEqual(cachedData);
    expect(mockProductRepo.findPaginated).not.toHaveBeenCalled();
  });

  it('deve consultar o banco de dados (MISS), gravar no cache com TTL e liberar o lock quando houver cache miss', async () => {
    const dbData = {
      items: [
        {
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          name: 'Capa Silicone iPhone 15',
          description: 'Top',
          price: 89.9,
          stockQty: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };

    mockCacheService.get.mockResolvedValueOnce(null);
    mockCacheService.acquireLock.mockResolvedValueOnce(true);
    mockProductRepo.findPaginated.mockResolvedValueOnce(dbData);

    const result = await useCase.execute(1, 10);

    expect(result.cacheStatus).toBe('MISS');
    expect(result.data).toEqual(dbData);
    expect(mockProductRepo.findPaginated).toHaveBeenCalledWith({ page: 1, limit: 10 });
    expect(mockCacheService.set).toHaveBeenCalledWith('catalog:page:1:limit:10', dbData, 30);
    expect(mockCacheService.releaseLock).toHaveBeenCalledWith('lock:catalog:page:1:limit:10');
  });
});

