import { Inject, Injectable } from '@nestjs/common';
import {
  IProductRepository,
  PRODUCT_REPOSITORY,
  PaginatedProducts,
} from '../../../core/products/product.repository.interface';
import { RedisCacheService } from '../../../infra/cache/redis-cache.service';
import { StructuredLoggerService } from '../../../infra/observability/logger.service';

export interface GetProductsResult {
  data: PaginatedProducts;
  cacheStatus: 'HIT' | 'MISS';
}

@Injectable()
export class GetProductsUseCase {
  private readonly CACHE_TTL_SECONDS = 30;

  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly productRepo: IProductRepository,
    private readonly cache: RedisCacheService,
    private readonly logger: StructuredLoggerService,
  ) {}

  async execute(page: number, limit: number): Promise<GetProductsResult> {
    const cacheKey = `catalog:page:${page}:limit:${limit}`;

    // 1. Tentar ler do Cache Distribuído (Redis)
    const cachedData = await this.cache.get<PaginatedProducts>(cacheKey);
    if (cachedData) {
      this.logger.log(`Catálogo recuperado do cache Redis (HIT)`, { cache_key: cacheKey, cache_status: 'HIT' });
      return { data: cachedData, cacheStatus: 'HIT' };
    }

    // 2. Proteção contra Cache Stampede via Lock Distribuído
    const lockKey = `lock:${cacheKey}`;
    const acquiredLock = await this.cache.acquireLock(lockKey, 2000);

    if (!acquiredLock) {
      // Outro processo concorrente já está buscando no banco; aguardamos 80ms para consumir o cache aquecido
      await new Promise((resolve) => setTimeout(resolve, 80));
      const retryCachedData = await this.cache.get<PaginatedProducts>(cacheKey);
      if (retryCachedData) {
        return { data: retryCachedData, cacheStatus: 'HIT' };
      }
    }

    try {
      // 3. Consulta ao Repositório (PostgreSQL)
      this.logger.log(`Consultando catálogo no banco de dados (MISS)`, { cache_key: cacheKey, cache_status: 'MISS' });
      const productsData = await this.productRepo.findPaginated({ page, limit });

      // 4. Salvar no Redis com TTL
      await this.cache.set(cacheKey, productsData, this.CACHE_TTL_SECONDS);

      return { data: productsData, cacheStatus: 'MISS' };
    } finally {
      if (acquiredLock) {
        await this.cache.releaseLock(lockKey);
      }
    }
  }
}

