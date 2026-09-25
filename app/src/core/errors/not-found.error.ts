import { AppError } from './app.error'

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super(message)
  }
}

export class ProductNotFoundError extends NotFoundError {
  constructor(productId: string) {
    super(`Product with ID "${productId}" not found in catalog.`)
  }
}

export class OrderNotFoundError extends NotFoundError {
  constructor(orderId: string) {
    super(`Order with ID "${orderId}" not found.`)
  }
}
