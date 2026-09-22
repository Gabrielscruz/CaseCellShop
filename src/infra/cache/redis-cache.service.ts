import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.client';
import { MetricsService } from '../observability/metrics.service';
import { StructuredLoggerService } from '../observability/logger.service';

@Injectable()
export class RedisCacheService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly metrics: MetricsService,
    private readonly logger: StructuredLoggerService,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      if (data) {
        this.metrics.cacheRequestsTotal.inc({ status: 'hit' });
        return JSON.parse(data) as T;
      }
      this.metrics.cacheRequestsTotal.inc({ status: 'miss' });
      return null;
    } catch (error) {
      this.logger.warn(`Erro ao ler chave de cache "${key}". Prosseguindo como cache miss.`, { error });
      this.metrics.cacheRequestsTotal.inc({ status: 'miss' });
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await this.redis.set(key, serialized, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Erro ao salvar chave de cache "${key}".`, { error });
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn(`Erro ao deletar chave de cache "${key}".`, { error });
    }
  }

  /**
   * Lock Distribuído Atômico no Redis (Prevenção de Cache Stampede):
   * Usa SET com NX (só cria se não existir) e PX (expiração em milissegundos).
   */
  async acquireLock(lockKey: string, ttlMs: number = 2000): Promise<boolean> {
    try {
      const result = await this.redis.set(`lock:${lockKey}`, 'locked', 'PX', ttlMs, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(`Erro ao adquirir lock de cache "${lockKey}".`, { error });
      return false;
    }
  }

  async releaseLock(lockKey: string): Promise<void> {
    try {
      await this.redis.del(`lock:${lockKey}`);
    } catch (error) {
      this.logger.warn(`Erro ao liberar lock de cache "${lockKey}".`, { error });
    }
  }

  /**
   * Idempotência no Redis:
   * Grava atomicamente com NX para evitar processamento simultâneo (duplo clique).
   */
  async acquireIdempotencyLock(key: string, ttlSeconds: number = 120): Promise<boolean> {
    try {
      const result = await this.redis.set(`idempotency:${key}`, 'PROCESSING', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Erro ao adquirir trava de idempotência para chave "${key}".`, undefined, { error });
      return false;
    }
  }

  async setIdempotencyResult(key: string, value: any, ttlSeconds: number = 86400): Promise<void> {
    try {
      await this.redis.set(`idempotency:${key}`, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.error(`Erro ao gravar resultado de idempotência para chave "${key}".`, undefined, { error });
    }
  }

  async getIdempotencyResult<T>(key: string): Promise<T | string | null> {
    try {
      const data = await this.redis.get(`idempotency:${key}`);
      if (!data) return null;
      if (data === 'PROCESSING') return 'PROCESSING';
      return JSON.parse(data) as T;
    } catch (error) {
      this.logger.warn(`Erro ao buscar idempotência para chave "${key}".`, { error });
      return null;
    }
  }
}

