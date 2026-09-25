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
      mockRedis.get.mockResolvedValueOnce(null)
      mockRedis.set.mockResolvedValueOnce('OK')
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

      expect(mockRedis.set).toHaveBeenCalledWith(
        key,
        JSON.stringify(mockData),
        'EX',
        30,
      )
      expect(mockRedis.set).toHaveBeenCalledWith(
        fallbackKey,
        JSON.stringify(mockData),
        'EX',
        86400,
      )
      expect(mockRedis.del).toHaveBeenCalledWith(`lock:${key}`)
    })

    it('deve acionar o Fallback Gracioso e retornar status STALE quando o loader falhar (ex: queda do banco)', async () => {
      mockRedis.get.mockResolvedValueOnce(null)
      mockRedis.set.mockResolvedValueOnce('OK')
      const loader = jest
        .fn()
        .mockRejectedValueOnce(new Error('PostgreSQL Connection Timeout'))
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
      expect(mockRedis.del).toHaveBeenCalledWith(`lock:${key}`)
    })

    it('deve propagar a exceção original quando o loader falhar e não houver fallback em cache', async () => {
      mockRedis.get.mockResolvedValueOnce(null)
      mockRedis.set.mockResolvedValueOnce('OK')
      const loader = jest
        .fn()
        .mockRejectedValueOnce(new Error('PostgreSQL Fatal Error'))
      mockRedis.get.mockResolvedValueOnce(null)

      await expect(
        service.getOrSetWithFallback({
          key,
          ttlSeconds: 30,
          fallbackTtlSeconds: 86400,
          loader,
        }),
      ).rejects.toThrow('PostgreSQL Fatal Error')

      expect(mockRedis.del).toHaveBeenCalledWith(`lock:${key}`)
    })

    it('deve aguardar e reutilizar o cache caso o lock esteja ocupado por outro processo (Prevenção de Stampede)', async () => {
      mockRedis.get.mockResolvedValueOnce(null)
      mockRedis.set.mockResolvedValueOnce(null)
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
