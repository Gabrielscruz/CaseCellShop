import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { MetricsService } from './metrics.service'

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = process.hrtime()

    res.on('finish', () => {
      if (req.originalUrl === '/metrics' || req.baseUrl === '/metrics') {
        return
      }

      const [seconds, nanoseconds] = process.hrtime(startTime)
      const durationSeconds = seconds + nanoseconds / 1e9

      const route = req.baseUrl || req.route?.path || req.path || 'unknown'
      const method = req.method
      const statusCode = String(res.statusCode)

      this.metrics.httpRequestDurationSeconds.observe(
        { route, method, status_code: statusCode },
        durationSeconds,
      )
    })

    next()
  }
}
