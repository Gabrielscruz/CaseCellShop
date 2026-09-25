import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { StructuredLoggerService } from '../../infra/observability/logger.service'
import { correlationStorage } from '../../infra/observability/correlation-id.middleware'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const correlationId =
      correlationStorage.getStore() ||
      (request.headers['x-correlation-id'] as string) ||
      'unknown'

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let errorName = 'InternalServerError'
    let message: string | string[] = 'Internal server error.'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      errorName = exception.name
      const res = exception.getResponse()

      if (typeof res === 'string') {
        message = res
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>
        message = resObj.message || exception.message
        errorName = resObj.error || exception.name
      }
    } else if (exception instanceof Error) {
      errorName = exception.name
      message =
        process.env.NODE_ENV === 'production'
          ? 'Internal server error.'
          : exception.message
    }

    const errorPayload = {
      statusCode: status,
      error: errorName,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    }

    // Observabilidade: Logs Estruturados diferenciando severidade
    if (status >= 500) {
      this.logger.error(
        `[HTTP 5xx] Erro interno durante requisição ${request.method} ${request.url}: ${exception instanceof Error ? exception.message : 'Desconhecido'}`,
        exception instanceof Error ? exception.stack : undefined,
        {
          correlationId,
          statusCode: status,
          path: request.url,
          method: request.method,
          error:
            exception instanceof Error ? exception.message : String(exception),
        },
      )
    } else {
      this.logger.warn(
        `[HTTP ${status}] Falha na requisição ${request.method} ${request.url}: ${Array.isArray(message) ? message.join('; ') : message}`,
        {
          correlationId,
          statusCode: status,
          path: request.url,
          method: request.method,
        },
      )
    }

    response.status(status).json(errorPayload)
  }
}
