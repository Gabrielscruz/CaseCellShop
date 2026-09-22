import { Controller, Get, Query, Res, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiHeader } from '@nestjs/swagger';
import { Response } from 'express';
import { FindProductsDto } from './dto/find-products.dto';
import { GetProductsUseCase } from './use-cases/get-products.use-case';

@ApiTags('Produtos')
@Controller('products')
export class ProductsController {
  constructor(private readonly getProductsUseCase: GetProductsUseCase) {}

  @Get()
  @ApiOperation({
    summary: 'Listar catálogo de capinhas com cache distribuído (Cache-Aside)',
    description:
      'Retorna listagem paginada de capinhas de celular. Utiliza cache no Redis com TTL de 30 segundos e prevenção contra Cache Stampede.',
  })
  @ApiHeader({
    name: 'x-correlation-id',
    description: 'Identificador único de rastreabilidade distribuída da transação',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Catálogo de produtos retornado com sucesso.',
    headers: {
      'x-cache-status': {
        description: 'Informa se os dados vieram do Redis (HIT) ou do PostgreSQL (MISS)',
        schema: { type: 'string', example: 'HIT' },
      },
    },
  })
  async getProducts(@Query() query: FindProductsDto, @Res() res: Response) {
    const { page, limit } = query;
    const { data, cacheStatus } = await this.getProductsUseCase.execute(page, limit);

    res.setHeader('x-cache-status', cacheStatus);
    return res.status(HttpStatus.OK).json(data);
  }
}

