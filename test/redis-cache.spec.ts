import { RedisCacheService } from '../src/infra/cache/redis-cache.service'

describe('RedisCacheService (Cache-Aside, Anti-Stampede Lock & Graceful Fallback)', () => {
  let service: RedisCacheService
  let mockRedis: any
  let mockMetrics: any
  let mockLogger: any

  beforeEach(() => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    }

    mockMetrics = {
      cacheRequestsTotal: {
        inc: jest.fn(),
      },
    }

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }

    service = new RedisCacheService(mockRedis, mockMetrics, mockLogger)
  })

  describe('getOrSetWithFallback', () => {
    const key = 'catalog:cursor:first:limit:1000'
    const fallbackKey = `fallback:${key}`
    const mockData = { items: [{ id: '1', name: 'Item 1' }] }

    it('deve retornar HIT imediatamente quando o cache primário estiver disponível', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockData))
      const loader = jest.fn()

      const result = await service.getOrSetWithFallback({
        key,
        ttlSeconds: 30,
        fallbackTtlSeconds: 86400,
        loader,
      })

      expect(result.cacheStatus).toBe('HIT')
      expect(result.data).toEqual(mockData)
      expect(loader).not.toHaveBeenCalled()
      expect(mockRedis.set).not.toHaveBeenCalled()
    })

    it('deve executar o loader, salvar no cache primário e de fallback e retornar MISS quando o cache estiver vazio', async () => {
      // 1. Cache primário vazio
      mockRedis.get.mockResolvedValueOnce(null)
      // 2. Lock adquirido
      mockRedis.set.mockResolvedValueOnce('OK')
      // 3. Loader retorna dados
      const loader = jest.fn().mockResolvedValueOnce(mockData)

      const result = await service.getOrSetWithFallback({
        key,
        ttlSeconds: 30,
        fallbackTtlSeconds: 86400,
        loader,
      })

      expect(result.cacheStatus).toBe('MISS')
      expect(result.data).toEqual(mockData)
      expect(loader).toHaveBeenCalledTimes(1)

      // Grava no cache quente (30s)
      expect(mockRedis.set).toHaveBeenCalledWith(
        key,
        JSON.stringify(mockData),
        'EX',
        30,
      )
      // Grava no fallback (24h)
      expect(mockRedis.set).toHaveBeenCalledWith(
        fallbackKey,
        JSON.stringify(mockData),
        'EX',
        86400,
      )
      // Libera o lock
      expect(mockRedis.del).toHaveBeenCalledWith(`lock:${key}`)
    })

    it('deve acionar o Fallback Gracioso e retornar status STALE quando o loader falhar (ex: queda do banco)', async () => {
      // 1. Cache primário vazio
      mockRedis.get.mockResolvedValueOnce(null)
      // 2. Lock adquirido
      mockRedis.set.mockResolvedValueOnce('OK')
      // 3. Loader falha (timeout no banco de dados)
      const loader = jest
        .fn()
        .mockRejectedValueOnce(new Error('PostgreSQL Connection Timeout'))
      // 4. Redis possui cópia de fallback preservada
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockData))

      const result = await service.getOrSetWithFallback({
        key,
        ttlSeconds: 30,
        fallbackTtlSeconds: 86400,
        loader,
      })

      expect(result.cacheStatus).toBe('STALE')
      expect(result.data).toEqual(mockData)
      expect(mockLogger.warn).toHaveBeenCalled()
      // Garante liberação do lock no finally
      expect(mockRedis.del).toHaveBeenCalledWith(`lock:${key}`)
    })

    it('deve propagar a exceção original quando o loader falhar e não houver fallback em cache', async () => {
      mockRedis.get.mockResolvedValueOnce(null)
      mockRedis.set.mockResolvedValueOnce('OK')
      const loader = jest
        .fn()
        .mockRejectedValueOnce(new Error('PostgreSQL Fatal Error'))
      // Nenhum fallback disponível
      mockRedis.get.mockResolvedValueOnce(null)

      await expect(
        service.getOrSetWithFallback({
          key,
          ttlSeconds: 30,
          fallbackTtlSeconds: 86400,
          loader,
        }),
      ).rejects.toThrow('PostgreSQL Fatal Error')

      // Garante liberação do lock no finally
      expect(mockRedis.del).toHaveBeenCalledWith(`lock:${key}`)
    })

    it('deve aguardar e reutilizar o cache caso o lock esteja ocupado por outro processo (Prevenção de Stampede)', async () => {
      // 1. Cache primário vazio
      mockRedis.get.mockResolvedValueOnce(null)
      // 2. Lock falha (outro nó está processando)
      mockRedis.set.mockResolvedValueOnce(null)
      // 3. Após pequena espera de 80ms, o cache foi aquecido pelo outro nó
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockData))

      const loader = jest.fn()

      const result = await service.getOrSetWithFallback({
        key,
        ttlSeconds: 30,
        fallbackTtlSeconds: 86400,
        loader,
      })

      expect(result.cacheStatus).toBe('HIT')
      expect(result.data).toEqual(mockData)
      expect(loader).not.toHaveBeenCalled()
    })
  })
})
