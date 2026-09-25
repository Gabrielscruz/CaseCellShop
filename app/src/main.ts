import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { StructuredLoggerService } from './infra/observability/logger.service'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config()

for (const key of Object.keys(process.env)) {
  const val = process.env[key]
  if (val && val.includes('${')) {
    process.env[key] = val.replace(/\${(\w+)}/g, (_, k) => process.env[k] || '')
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  })

  const logger = app.get(StructuredLoggerService)
  app.useLogger(logger)

  // Validação global com class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  // Configuração da especificação OpenAPI 3.0 (Swagger)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CaseCellShop — Catálogo de Produtos e Vitrine')
    .setDescription(
      'Documentação dos contratos de API da vitrine da CaseCellShop: Catálogo de Produtos com Paginação Cursor-Based (createdAt) e Cache-Aside (Redis).',
    )
    .setVersion('1.0.0')
    .addTag(
      'Produtos',
      'Consultas de vitrine de capas de celular com cache distribuído',
    )
    .addTag('Health', 'Verificação de integridade e prontidão da aplicação')
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api/docs', app, document)

  const port = process.env.PORT || 3000
  await app.listen(port)

  logger.log(`🚀 Aplicação CaseCellShop rodando com sucesso na porta ${port}`, {
    port,
    swagger_url: `http://localhost:${port}/api/docs`,
    metrics_url: `http://localhost:${port}/metrics`,
  })
}

bootstrap()
