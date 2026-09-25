import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../.env') })
dotenv.config()

const databaseUrl = (
  process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USER || 'casecellshop'}:${process.env.DB_PASSWORD || 'casecellshop_pwd'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'casecellshop_db'}?schema=public`
).replace(/\${(\w+)}/g, (_, k) => process.env[k] || '')

import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
})

