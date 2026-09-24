import { delay } from '../src/utils/time.util'

describe('TimeUtil', () => {
  it('deve aguardar o tempo especificado em milissegundos', async () => {
    const start = Date.now()
    await delay(50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40)
  })
})
