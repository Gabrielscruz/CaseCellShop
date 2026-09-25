import { AppError } from './app.error'

export class BadRequestError extends AppError {
  constructor(message = 'Invalid request.') {
    super(message)
  }
}

export class InvalidCursorError extends BadRequestError {
  constructor(message = 'Invalid or corrupted pagination cursor.') {
    super(message)
  }
}
