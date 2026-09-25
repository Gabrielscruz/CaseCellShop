import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common'
import { throwError, lastValueFrom } from 'rxjs'
import { Prisma } from '@prisma/client'
import { ErrorHandlerInterceptor } from '../src/common/interceptors/error-handler.interceptor'
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter'
import { NotFoundError } from '../src/core/errors/not-found.error'
import { ConflictError } from '../src/core/errors/conflict.error'
import { BadRequestError } from '../src/core/errors/bad-request.error'

describe('Tratamento de Erros: Interceptors e Exception Filters', () => {
  describe('ErrorHandlerInterceptor (Desacoplamento Domínio/Prisma -> HTTP)', () => {
    let interceptor: ErrorHandlerInterceptor

    beforeEach(() => {
      interceptor = new ErrorHandlerInterceptor()
    })

    const createMockContext = () => ({}) as any
    const createMockHandler = (errorToThrow: any) => ({
      handle: () => throwError(() => errorToThrow),
    })

    it('deve converter NotFoundError de domínio em NotFoundException (HTTP 404)', async () => {
      const handler = createMockHandler(new NotFoundError('Product not found'))
      await expect(
        lastValueFrom(interceptor.intercept(createMockContext(), handler)),
      ).rejects.toThrow(NotFoundException)
    })

    it('deve converter ConflictError de domínio em ConflictException (HTTP 409)', async () => {
      const handler = createMockHandler(new ConflictError('Insufficient stock'))
      await expect(
        lastValueFrom(interceptor.intercept(createMockContext(), handler)),
      ).rejects.toThrow(ConflictException)
    })

    it('deve converter BadRequestError de domínio em BadRequestException (HTTP 400)', async () => {
      const handler = createMockHandler(new BadRequestError('Invalid cursor'))
      await expect(
        lastValueFrom(interceptor.intercept(createMockContext(), handler)),
      ).rejects.toThrow(BadRequestException)
    })

    it('deve converter erro do Prisma P2002 (Unique Constraint) em ConflictException (HTTP 409)', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
          meta: { target: ['idempotency_key'] },
        },
      )
      const handler = createMockHandler(prismaError)

      await expect(
        lastValueFrom(interceptor.intercept(createMockContext(), handler)),
      ).rejects.toThrow(ConflictException)
    })

    it('deve converter erro do Prisma P2025 (Record not found) em NotFoundException (HTTP 404)', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        {
          code: 'P2025',
          clientVersion: '7.10.0',
        },
      )
      const handler = createMockHandler(prismaError)

      await expect(
        lastValueFrom(interceptor.intercept(createMockContext(), handler)),
      ).rejects.toThrow(NotFoundException)
    })

    it('deve repassar HttpException existente sem alterá-la', async () => {
      const originalHttpException = new HttpException(
        'Forbidden custom',
        HttpStatus.FORBIDDEN,
      )
      const handler = createMockHandler(originalHttpException)

      await expect(
        lastValueFrom(interceptor.intercept(createMockContext(), handler)),
      ).rejects.toThrow(originalHttpException)
    })
  })

  describe('GlobalExceptionFilter (Padronização de Resposta e Logs Estruturados)', () => {
    let filter: GlobalExceptionFilter
    let mockLogger: any
    let mockResponse: any
    let mockRequest: any
    let mockHost: any

    beforeEach(() => {
      mockLogger = {
        error: jest.fn(),
        warn: jest.fn(),
        log: jest.fn(),
      }
      filter = new GlobalExceptionFilter(mockLogger)

      mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      }
      mockRequest = {
        method: 'POST',
        url: '/checkout',
        headers: { 'x-correlation-id': 'test-correlation-id-uuid' },
      }
      mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => mockRequest,
        }),
      }
    })

    it('deve capturar ConflictException, registrar log de aviso e retornar JSON padronizado com correlationId', () => {
      const exception = new ConflictException('Insufficient stock for product.')

      filter.catch(exception, mockHost)

      expect(mockResponse.status).toHaveBeenCalledWith(409)
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          error: 'Conflict',
          message: 'Insufficient stock for product.',
          correlationId: 'test-correlation-id-uuid',
          path: '/checkout',
        }),
      )
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[HTTP 409]'),
        expect.objectContaining({ correlationId: 'test-correlation-id-uuid' }),
      )
    })

    it('deve capturar erro desconhecido (500), registrar log de erro com stack e retornar JSON 500', () => {
      const error = new Error('Fatal internal driver error')

      filter.catch(error, mockHost)

      expect(mockResponse.status).toHaveBeenCalledWith(500)
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          correlationId: 'test-correlation-id-uuid',
          path: '/checkout',
        }),
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[HTTP 5xx]'),
        expect.any(String),
        expect.objectContaining({ correlationId: 'test-correlation-id-uuid' }),
      )
    })
  })
})
