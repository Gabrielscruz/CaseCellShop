import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { StructuredLoggerService } from './infra/observability/logger.service';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(StructuredLoggerService);
  app.useLogger(logger);

  // Validação global com class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configuração da especificação OpenAPI 3.0 (Swagger)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CaseCellShop — API de Alta Concorrência e Vitrine')
    .setDescription(
      'Documentação formal dos contratos de API da CaseCellShop: Catálogo com Cache-Aside (Redis), Checkout Assíncrono com tolerância a falhas e Idempotência, e Consulta de Status.',
    )
    .setVersion('1.0.0')
    .addTag('Produtos', 'Consultas de vitrine de capas de celular com cache distribuído')
    .addTag('Checkout e Pedidos', 'Processamento concorrente e resiliente de compras')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 Aplicação CaseCellShop rodando com sucesso na porta ${port}`, {
    port,
    swagger_url: `http://localhost:${port}/api/docs`,
    metrics_url: `http://localhost:${port}/metrics`,
  });
}

bootstrap();

