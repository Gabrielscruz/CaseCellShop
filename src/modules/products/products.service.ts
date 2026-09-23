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
  private readonly FALLBACK_TTL_SECONDS = 86400 // 24 horas para tolerância a falhas

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepo: IProductRepository,
    private readonly cache: RedisCacheService,
  ) {}

  /**
   * Busca produtos com paginação por cursor (createdAt), Cache-Aside e Fallback Gracioso.
   * Aplica Single Responsibility Principle delegando decodificação para utils e cache para RedisCacheService.
   *
   * @param limit Quantidade de itens por página (default 1000)
   * @param cursor Cursor opaco em Base64URL para a próxima página
   */
  async findAll(
    limit: number = 1000,
    cursor?: string,
  ): Promise<FindAllProductsResult> {
    // 1. Decodificação segura do cursor de paginação (utilitário reutilizável)
    const parsedCursor = decodeCursor(cursor)

    // 2. Construção determinística da chave de cache
    const cacheKey = buildCatalogCacheKey(cursor, limit)

    // 3. Execução resiliente com Cache-Aside, Lock Anti-Stampede e Fallback Gracioso
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
