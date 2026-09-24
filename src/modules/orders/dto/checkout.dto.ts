import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator'

export class CheckoutItemDto {
  @ApiProperty({
    description: 'UUID do produto a ser comprado',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsUUID('4', { message: 'O productId deve ser um UUID válido v4.' })
  @IsNotEmpty({ message: 'O productId é obrigatório.' })
  productId: string

  @ApiProperty({
    description: 'Quantidade desejada do item (mínimo 1)',
    example: 1,
    minimum: 1,
  })
  @IsInt({ message: 'A quantidade deve ser um número inteiro.' })
  @Min(1, { message: 'A quantidade mínima por item é 1.' })
  quantity: number
}

export class CheckoutDto {
  @ApiProperty({
    description: 'Identificador único do cliente / usuário que realiza a compra',
    example: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
  })
  @IsUUID('4', { message: 'O customerId deve ser um UUID válido v4.' })
  @IsNotEmpty({ message: 'O customerId é obrigatório.' })
  customerId: string

  @ApiProperty({
    description: 'Lista de produtos e quantidades do carrinho',
    type: [CheckoutItemDto],
  })
  @IsArray({ message: 'Os itens devem ser enviados em formato de lista.' })
  @ArrayMinSize(1, { message: 'O carrinho deve conter pelo menos 1 item.' })
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[]
}

export class CheckoutResponseDto {
  @ApiProperty({
    description: 'Identificador único do pedido criado para acompanhamento',
    example: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
  })
  orderId: string

  @ApiProperty({
    description: 'Status do pedido na esteira assíncrona',
    example: 'ACCEPTED',
    enum: ['ACCEPTED', 'PROCESSING', 'BILLED', 'FAILED'],
  })
  status: string
}

