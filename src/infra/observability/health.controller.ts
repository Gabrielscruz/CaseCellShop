import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../cache/redis.client'
import { PrismaService } from '../database/prisma.service'
import { StructuredLoggerService } from './logger.service'

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: StructuredLoggerService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Verificar a saúde da aplicação e de suas dependências (PostgreSQL e Redis)',
    description:
      'Executa ping ativo no Redis e checagem de conectividade no banco PostgreSQL via Prisma. Retorna HTTP 200 se saudável ou HTTP 503 caso algum serviço esteja indisponível.',
  })
  @ApiResponse({
    status: 200,
    description: 'Todos os serviços essenciais estão saudáveis e operacionais.',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2026-09-22T22:28:00.000Z' },
        uptimeSeconds: { type: 'number', example: 42.5 },
        services: {
          type: 'object',
          properties: {
            database: { type: 'string', example: 'up' },
            redis: { type: 'string', example: 'up' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Uma ou mais dependências críticas estão fora do ar.',
  })
  async checkHealth(@Res() res: Response) {
    let isDatabaseUp = false
    let isRedisUp = false

    // 1. Checagem do PostgreSQL via Prisma Client (sem raw queries)
    try {
      await this.prisma.product.findFirst({ select: { id: true } })
      isDatabaseUp = true
    } catch (error) {
      this.logger.error(
        'Health Check: falha ao conectar no PostgreSQL via Prisma',
        undefined,
        { error },
      )
    }

    // 2. Checagem do Redis
    try {
      const pingResult = await this.redis.ping()
      isRedisUp = pingResult === 'PONG'
    } catch (error) {
      this.logger.error('Health Check: falha ao conectar no Redis', undefined, {
        error,
      })
    }

    const isHealthy = isDatabaseUp && isRedisUp
    const statusCode = isHealthy
      ? HttpStatus.OK
      : HttpStatus.SERVICE_UNAVAILABLE

    const payload = {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: parseFloat(process.uptime().toFixed(2)),
      services: {
        database: isDatabaseUp ? 'up' : 'down',
        redis: isRedisUp ? 'up' : 'down',
      },
    }

    return res.status(statusCode).json(payload)
  }
}
