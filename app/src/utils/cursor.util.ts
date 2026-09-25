import { BadRequestException } from '@nestjs/common'
import { CursorData } from '../core/products/product.repository.interface'

export function encodeCursor(createdAt: Date | string, id: string): string {
  const dateString =
    createdAt instanceof Date ? createdAt.toISOString() : createdAt
  const payload = {
    createdAt: dateString,
    id,
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

export function decodeCursor(cursor?: string): CursorData | undefined {
  if (!cursor) {
    return undefined
  }

  try {
    const jsonString = Buffer.from(cursor, 'base64url').toString('utf-8')
    const raw = JSON.parse(jsonString)

    if (raw.createdAt && raw.id && typeof raw.id === 'string') {
      const createdAtDate = new Date(raw.createdAt)
      if (isNaN(createdAtDate.getTime())) {
        throw new Error('Data do cursor inválida')
      }
      return {
        createdAt: createdAtDate,
        id: raw.id,
      }
    }

    throw new Error('Campos obrigatórios do cursor ausentes')
  } catch {
    throw new BadRequestException('Cursor de paginação inválido ou corrompido.')
  }
}
