import { Global, Module } from '@nestjs/common';
import { REDIS_CLIENT, createRedisClient } from './redis.client';
import { RedisCacheService } from './redis-cache.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: createRedisClient,
    },
    RedisCacheService,
  ],
  exports: [REDIS_CLIENT, RedisCacheService],
})
export class CacheModule {}

