import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common'
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import {
  CursorPaginatedProductsResponseDto,
  FindProductsDto,
} from './dto/find-products.dto'
import { ProductsService } from './products.service'

@ApiTags('Produtos')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Listar catálogo de capinhas com Paginação Cursor-Based e Cache-Aside (Redis)',
    description:
      'Retorna o catálogo de produtos de forma ultra-escalável sem degradação linear de OFFSET. Utiliza ordenação determinística por created_at e id, serializando o cursor em Base64. Possui cache distribuído no Redis com TTL de 30s e proteção contra Cache Stampede.',
  })
  @ApiHeader({
    name: 'x-correlation-id',
    description:
      'Identificador único de rastreabilidade distribuída da transação',
    required: false,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Página do catálogo retornada com sucesso.',
    type: CursorPaginatedProductsResponseDto,
    headers: {
      'x-cache-status': {
        description:
          'Informa se os dados vieram da memória do Redis (HIT) ou do PostgreSQL (MISS)',
        schema: { type: 'string', example: 'HIT' },
      },
    },
  })
  async getProducts(@Query() query: FindProductsDto, @Res() res: Response) {
    const { limit, cursor } = query
    const { data, cacheStatus } = await this.productsService.findAll(
      limit,
      cursor,
    )

    res.setHeader('x-cache-status', cacheStatus)
    return res.status(HttpStatus.OK).json(data)
  }
}
