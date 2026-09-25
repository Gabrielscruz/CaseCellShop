import { BadRequestException } from '@nestjs/common'
import { decodeCursor, encodeCursor } from '../src/utils/cursor.util'

describe('CursorUtil', () => {
  it('deve codificar e decodificar perfeitamente data e ID', () => {
    const testDate = new Date('2026-09-22T20:30:00.000Z')
    const testId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

    const encoded = encodeCursor(testDate, testId)
    expect(typeof encoded).toBe('string')

    const decoded = decodeCursor(encoded)
    expect(decoded).toBeDefined()
    expect(decoded?.createdAt).toEqual(testDate)
    expect(decoded?.id).toBe(testId)
  })

  it('deve aceitar createdAt como string ISO', () => {
    const dateStr = '2026-09-22T21:00:00.000Z'
    const testId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'

    const encoded = encodeCursor(dateStr, testId)
    const decoded = decodeCursor(encoded)

    expect(decoded?.createdAt).toEqual(new Date(dateStr))
    expect(decoded?.id).toBe(testId)
  })

  it('deve retornar undefined se nenhum cursor for fornecido', () => {
    expect(decodeCursor(undefined)).toBeUndefined()
    expect(decodeCursor('')).toBeUndefined()
  })

  it('deve lançar BadRequestException se o cursor for uma string corrompida', () => {
    expect(() => decodeCursor('cursor-invalido-qualquer')).toThrow(
      BadRequestException,
    )
  })

  it('deve lançar BadRequestException se o JSON do cursor não contiver createdAt ou id', () => {
    const invalidPayload = Buffer.from(
      JSON.stringify({ algo: 'errado' }),
    ).toString('base64url')
    expect(() => decodeCursor(invalidPayload)).toThrow(BadRequestException)
  })

  it('deve lançar BadRequestException se a data for inválida', () => {
    const invalidDatePayload = Buffer.from(
      JSON.stringify({ createdAt: 'data-invalida', id: '123' }),
    ).toString('base64url')
    expect(() => decodeCursor(invalidDatePayload)).toThrow(BadRequestException)
  })
})
