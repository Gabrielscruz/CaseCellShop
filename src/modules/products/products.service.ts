import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import {
  CursorData,
  CursorPaginatedProducts,
  IProductRepository,
  PRODUCT_REPOSITORY,
} from '../../core/products/product.repository.interface'
import { RedisCacheService } from '../../infra/cache/redis-cache.service'
import { StructuredLoggerService } from '../../infra/observability/logger.service'

export interface FindAllProductsResult {
  data: CursorPaginatedProducts
  cacheStatus: 'HIT' | 'MISS'
}

@Injectable()
export class ProductsService {
  private readonly CACHE_TTL_SECONDS = 30

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepo: IProductRepository,
    private readonly cache: RedisCacheService,
    private readonly logger: StructuredLoggerService,
  ) {}

  /**
   * Busca produtos com paginação por cursor (createdAt) e Cache-Aside (Redis)
   * @param limit Quantidade de itens por página (default 1000)
   * @param cursor Cursor opaco em Base64 para a próxima página
   */
  async findAll(
    limit: number = 1000,
    cursor?: string,
  ): Promise<FindAllProductsResult> {
    const cursorKey = cursor || 'first'
    const cacheKey = `catalog:cursor:${cursorKey}:limit:${limit}`

    // 1. Consulta ao Cache Distribuído (Redis)
    const cachedData = await this.cache.get<CursorPaginatedProducts>(cacheKey)
    if (cachedData) {
      this.logger.log(`Catálogo recuperado do cache Redis (HIT)`, {
        cache_key: cacheKey,
        cache_status: 'HIT',
        limit,
        cursor: cursorKey,
      })
      return { data: cachedData, cacheStatus: 'HIT' }
    }

    // 2. Prevenção de Cache Stampede via Lock Distribuído
    const lockKey = `lock:${cacheKey}`
    const acquiredLock = await this.cache.acquireLock(lockKey, 2000)

    if (!acquiredLock) {
      // Outro processo já está buscando no banco; aguarda 80ms para consumir o cache aquecido
      await new Promise((resolve) => setTimeout(resolve, 80))
      const retryCachedData =
        await this.cache.get<CursorPaginatedProducts>(cacheKey)
      if (retryCachedData) {
        return { data: retryCachedData, cacheStatus: 'HIT' }
      }
    }

    try {
      // 3. Decodificação do cursor Base64 (baseado em createdAt e id)
      let parsedCursor: CursorData | undefined
      if (cursor) {
        try {
          const jsonString = Buffer.from(cursor, 'base64url').toString('utf-8')
          const raw = JSON.parse(jsonString)
          if (raw.createdAt && raw.id) {
            parsedCursor = {
              createdAt: new Date(raw.createdAt),
              id: raw.id,
            }
          } else {
            throw new Error('Campos do cursor ausentes')
          }
        } catch {
          throw new BadRequestException(
            'Cursor de paginação inválido ou corrompido.',
          )
        }
      }

      // 4. Consulta ao banco de dados via Prisma com Index Scan O(1)
      this.logger.log(`Consultando catálogo no banco de dados (MISS)`, {
        cache_key: cacheKey,
        cache_status: 'MISS',
        limit,
        has_cursor: !!parsedCursor,
      })

      const productsData = await this.productRepo.findPaginated({
        limit,
        cursor: parsedCursor,
      })

      // 5. Salva no Redis com TTL de 30s
      await this.cache.set(cacheKey, productsData, this.CACHE_TTL_SECONDS)

      return { data: productsData, cacheStatus: 'MISS' }
    } finally {
      if (acquiredLock) {
        await this.cache.releaseLock(lockKey)
      }
    }
  }

  async findById(id: string) {
    return this.productRepo.findById(id)
  }
}
