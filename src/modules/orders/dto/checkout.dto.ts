import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsNotEmpty, IsUUID, Min, ValidateNested } from 'class-validator';

export class CheckoutItemDto {
  @ApiProperty({ description: 'ID do produto (UUID)', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'Quantidade desejada', example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CheckoutDto {
  @ApiProperty({
    description: 'Lista de produtos e quantidades do pedido',
    type: [CheckoutItemDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];
}

