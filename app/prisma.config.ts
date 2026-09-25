import * as path from 'path'
import * as dotenv from 'dotenv'
import { defineConfig } from 'prisma/config'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(__dirname, '../.env') })
dotenv.config()

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://casecellshop:casecellshop_pwd@localhost:5432/casecellshop_db?schema=public',
  },
})

