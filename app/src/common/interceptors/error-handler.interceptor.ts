import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common'
import { Observable, throwError } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { Prisma } from '@prisma/client'
import { NotFoundError } from '../../core/errors/not-found.error'
import { ConflictError } from '../../core/errors/conflict.error'
import { BadRequestError } from '../../core/errors/bad-request.error'

@Injectable()
export class ErrorHandlerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        if (error instanceof HttpException) {
          return throwError(() => error)
        }

        if (error instanceof NotFoundError) {
          return throwError(() => new NotFoundException(error.message))
        }

        if (error instanceof ConflictError) {
          return throwError(() => new ConflictException(error.message))
        }

        if (error instanceof BadRequestError) {
          return throwError(() => new BadRequestException(error.message))
        }

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          switch (error.code) {
            case 'P2002': {
              const target =
                (error.meta?.target as string[])?.join(', ') || 'unique field'
              return throwError(
                () =>
                  new ConflictException(
                    `Data conflict: record already exists for (${target}).`,
                  ),
              )
            }
            case 'P2025': {
              return throwError(
                () =>
                  new NotFoundException(
                    'Requested record was not found in the database.',
                  ),
              )
            }
            case 'P2003': {
              return throwError(
                () =>
                  new BadRequestException(
                    'Foreign key constraint violation: referenced entity does not exist.',
                  ),
              )
            }
            default:
              break
          }
        }

        return throwError(() => error)
      }),
    )
  }
}
