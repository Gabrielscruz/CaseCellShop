import { Injectable, LoggerService as INestLogger } from '@nestjs/common'
import pino from 'pino'
import { correlationStorage } from './correlation-id.middleware'

@Injectable()
export class StructuredLoggerService implements INestLogger {
  private readonly logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label }
      },
    },
  })

  private getCorrelationId(): string | undefined {
    return correlationStorage.getStore()
  }

  log(message: string, context?: Record<string, any>) {
    this.logger.info({
      correlation_id: this.getCorrelationId(),
      ...context,
      msg: message,
    })
  }

  error(message: string, trace?: string, context?: Record<string, any>) {
    this.logger.error({
      correlation_id: this.getCorrelationId(),
      stack_trace: trace,
      ...context,
      msg: message,
    })
  }

  warn(message: string, context?: Record<string, any>) {
    this.logger.warn({
      correlation_id: this.getCorrelationId(),
      ...context,
      msg: message,
    })
  }

  debug(message: string, context?: Record<string, any>) {
    this.logger.debug({
      correlation_id: this.getCorrelationId(),
      ...context,
      msg: message,
    })
  }

  verbose(message: string, context?: Record<string, any>) {
    this.logger.trace({
      correlation_id: this.getCorrelationId(),
      ...context,
      msg: message,
    })
  }
}
