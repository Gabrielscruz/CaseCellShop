import { Pool } from 'pg';

export const PG_POOL = Symbol('PG_POOL');

export function createPgPool(): Pool {
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'casecellshop',
    password: process.env.DB_PASSWORD || 'casecellshop_pwd',
    database: process.env.DB_NAME || 'casecellshop_db',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

