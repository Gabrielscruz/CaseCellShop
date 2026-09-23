import { Inject, Injectable } from '@nestjs/common'
import {
  CursorPaginatedProducts,
  IProductRepository,
  PRODUCT_REPOSITORY,
} from '../../core/products/product.repository.interface'
import {
  RedisCacheService,
  ResilientCacheResult,
} from '../../infra/cache/redis-cache.service'
import { decodeCursor } from '../../utils/cursor.util'
import { buildCatalogCacheKey } from '../../utils/cache.util'

export type FindAllProductsResult =
  ResilientCacheResult<CursorPaginatedProducts>

@Injectable()
export class ProductsService {
  private readonly CACHE_TTL_SECONDS = 30
  private readonly FALLBACK_TTL_SECONDS = 86400

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepo: IProductRepository,
    private readonly cache: RedisCacheService,
  ) {}

  async findAll(
    limit: number = 1000,
    cursor?: string,
  ): Promise<FindAllProductsResult> {
    const parsedCursor = decodeCursor(cursor)
    const cacheKey = buildCatalogCacheKey(cursor, limit)

    return this.cache.getOrSetWithFallback<CursorPaginatedProducts>({
      key: cacheKey,
      ttlSeconds: this.CACHE_TTL_SECONDS,
      fallbackTtlSeconds: this.FALLBACK_TTL_SECONDS,
      loader: () =>
        this.productRepo.findPaginated({
          limit,
          cursor: parsedCursor,
        }),
    })
  }

  async findById(id: string) {
    return this.productRepo.findById(id)
  }
}
