import * as path from 'path'
import * as dotenv from 'dotenv'
import { defineConfig, env } from 'prisma/config'

dotenv.config({ path: path.resolve(__dirname, '../.env') })
dotenv.config()

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})

