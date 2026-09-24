import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { CheckoutDto, CheckoutResponseDto } from './dto/checkout.dto'
import { OrdersService } from './orders.service'

@ApiTags('Checkout & Pedidos')
@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Iniciar processo de checkout de compra com processamento assíncrono via RabbitMQ',
    description:
      'Valida o carrinho, garante concorrência atômica de estoque no PostgreSQL, grava o pedido como ACCEPTED e publica mensagem no RabbitMQ para faturamento desacoplado no ERP. Suporta cabeçalho Idempotency-Key contra duplo clique.',
  })
  @ApiHeader({
    name: 'idempotency-key',
    description:
      'UUID v4 para prevenção de cobrança e pedidos duplicados em caso de duplo clique ou retentativas de rede.',
    required: false,
    example: 'c9bf9e57-1685-4c89-bafb-ff5af830be8a',
  })
  @ApiHeader({
    name: 'x-correlation-id',
    description: 'Identificador único de rastreabilidade distribuída',
    required: false,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 202,
    description:
      'Pedido aceito e enfileirado com sucesso para processamento em background.',
    type: CheckoutResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      'Conflito: estoque insuficiente para um ou mais produtos ou requisição com a mesma chave já em andamento.',
  })
  @ApiResponse({
    status: 404,
    description: 'Um ou mais produtos informados não existem no catálogo.',
  })
  async checkout(
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<CheckoutResponseDto> {
    return this.ordersService.processCheckout(
      dto,
      idempotencyKey,
      correlationId,
    )
  }

  @Get('orders/:id/status')
  @ApiOperation({
    summary: 'Consultar o status atual e ciclo de vida de um pedido',
    description:
      'Retorna o estado do pedido na esteira assíncrona (ACCEPTED, PROCESSING, BILLED ou FAILED).',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do pedido',
    example: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalhes e status do pedido retornados.',
  })
  @ApiResponse({
    status: 404,
    description: 'Pedido não encontrado.',
  })
  async getStatus(@Param('id', new ParseUUIDPipe()) id: string) {
    const order = await this.ordersService.getOrderStatus(id)
    return {
      orderId: order.id,
      status: order.status,
      totalAmount: order.totalAmount,
      failureReason: order.failureReason,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }
  }
}
