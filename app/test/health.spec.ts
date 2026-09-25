import { HealthController } from '../src/infra/observability/health.controller'
import { HttpStatus } from '@nestjs/common'

describe('HealthController', () => {
  let controller: HealthController
  let mockPrisma: any
  let mockRedis: any
  let mockLogger: any
  let mockResponse: any

  beforeEach(() => {
    mockPrisma = {
      product: {
        findFirst: jest.fn(),
      },
    }

    mockRedis = {
      ping: jest.fn(),
    }

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    }

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }

    controller = new HealthController(mockPrisma, mockRedis, mockLogger)
  })

  it('deve retornar HTTP 200 e status "ok" quando PostgreSQL e Redis estiverem operacionais', async () => {
    mockPrisma.product.findFirst.mockResolvedValueOnce({ id: 'some-uuid' })
    mockRedis.ping.mockResolvedValueOnce('PONG')

    await controller.checkHealth(mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK)
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        services: {
          database: 'up',
          redis: 'up',
        },
      }),
    )
  })

  it('deve retornar HTTP 503 e status "degraded" caso o banco de dados falhe', async () => {
    mockPrisma.product.findFirst.mockRejectedValueOnce(
      new Error('DB Connection Refused'),
    )
    mockRedis.ping.mockResolvedValueOnce('PONG')

    await controller.checkHealth(mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    )
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
        services: {
          database: 'down',
          redis: 'up',
        },
      }),
    )
  })

  it('deve retornar HTTP 503 e status "degraded" caso o Redis falhe', async () => {
    mockPrisma.product.findFirst.mockResolvedValueOnce({ id: 'some-uuid' })
    mockRedis.ping.mockRejectedValueOnce(new Error('Redis Timeout'))

    await controller.checkHealth(mockResponse)

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    )
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
        services: {
          database: 'up',
          redis: 'down',
        },
      }),
    )
  })
})
