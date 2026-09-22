import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CheckoutDto } from './dto/checkout.dto';
import { ProcessCheckoutUseCase } from './use-cases/process-checkout.use-case';
import { GetOrderStatusUseCase } from './use-cases/get-order-status.use-case';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('Checkout e Pedidos')
@Controller()
export class OrdersController {
  constructor(
    private readonly processCheckoutUseCase: ProcessCheckoutUseCase,
    private readonly getOrderStatusUseCase: GetOrderStatusUseCase,
  ) {}

  @Post('checkout')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Iniciar checkout assíncrono com tolerância a retry e prevenção de overselling',
    description:
      'Valida o estoque atomicamente no banco, enfileira o faturamento no BullMQ e responde imediatamente com HTTP 202 Accepted. Exige cabeçalho Idempotency-Key para proteção contra duplo clique.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Chave única de idempotência da requisição (ex.: UUID v4)',
    required: true,
    example: 'd3b07384-d113-4a11-b21a-6d60a1d636f4',
  })
  @ApiHeader({
    name: 'x-correlation-id',
    description: 'ID de correlação distribuída para observabilidade ponta a ponta',
    required: false,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 202,
    description: 'Pedido aceito e enfileirado para faturamento assíncrono.',
    schema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', example: 'ord-a4f6d3a1-2b47-4f51-8723-9f82d1c68123' },
        status: { type: 'string', example: 'ACCEPTED' },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Conflito de concorrência: Falta de estoque ou duplo clique simultâneo com a mesma chave.',
  })
  async checkout(
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('O cabeçalho "Idempotency-Key" é obrigatório no checkout.');
    }

    const effectiveCorrelationId = correlationId || uuidv4();
    return this.processCheckoutUseCase.execute(dto, idempotencyKey, effectiveCorrelationId);
  }

  @Get('orders/:orderId/status')
  @ApiOperation({
    summary: 'Consultar status do ciclo de vida do pedido',
    description:
      'Permite acompanhar o processamento assíncrono do pedido: ACCEPTED -> PROCESSING -> BILLED ou FAILED.',
  })
  @ApiParam({
    name: 'orderId',
    description: 'ID único do pedido retornado pelo checkout',
    example: 'ord-a4f6d3a1-2b47-4f51-8723-9f82d1c68123',
  })
  @ApiResponse({
    status: 200,
    description: 'Status do pedido recuperado com sucesso.',
  })
  @ApiResponse({
    status: 404,
    description: 'Pedido não encontrado.',
  })
  async getStatus(@Param('orderId') orderId: string) {
    return this.getOrderStatusUseCase.execute(orderId);
  }
}

