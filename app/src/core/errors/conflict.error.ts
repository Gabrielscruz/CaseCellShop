import { AppError } from './app.error'

export class ConflictError extends AppError {
  constructor(message = 'State conflict in operation.') {
    super(message)
  }
}

export class InsufficientStockError extends ConflictError {
  constructor(productId: string) {
    super(
      `Insufficient stock for product "${productId}". Transaction cancelled.`,
    )
  }
}

export class DuplicateTransactionError extends ConflictError {
  constructor(message = 'Duplicate transaction detected.') {
    super(message)
  }
}

export class TransactionInProgressError extends ConflictError {
  constructor(
    message = 'Transaction is already being processed. Please wait a moment.',
  ) {
    super(message)
  }
}
