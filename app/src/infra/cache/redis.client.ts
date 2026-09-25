import Redis from 'ioredis'

export const REDIS_CLIENT = Symbol('REDIS_CLIENT')

export function createRedisClient(): Redis {
  return new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000)
      return delay
    },
  })
}
