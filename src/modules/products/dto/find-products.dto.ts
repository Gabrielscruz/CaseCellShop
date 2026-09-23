import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class FindProductsDto {
  @ApiPropertyOptional({
    description: 'Quantidade de itens por página',
    default: 1000,
    minimum: 1,
    maximum: 1000,
    example: 1000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit: number = 1000

  @ApiPropertyOptional({
    description:
      'Cursor opaco em Base64 para buscar a próxima página (baseado em createdAt)',
    example:
      'eyJjcmVhdGVkQXQiOiIyMDI2LTA5LTIyVDIxOjQxOjAwLjAwMFoiLCJpZCI6ImEwZWViYzk5LTljMGItNGVmOC1iYjZkLTZiYjliZDM4MGExMSJ9',
  })
  @IsOptional()
  @IsString()
  cursor?: string
}

export class ProductItemDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id: string

  @ApiProperty({ example: 'Capinha Silicone iPhone 15 Pro - Midnight Black' })
  name: string

  @ApiProperty({
    example: 'Capa de silicone com toque sedoso e proteção aveludada interna.',
  })
  description: string

  @ApiProperty({ example: 89.9 })
  price: number

  @ApiProperty({ example: 10 })
  stockQty: number

  @ApiProperty({ example: '2026-09-22T21:41:00.000Z' })
  createdAt: Date

  @ApiProperty({ example: '2026-09-22T21:41:00.000Z' })
  updatedAt: Date
}

export class CursorPaginatedProductsResponseDto {
  @ApiProperty({ type: [ProductItemDto] })
  items: ProductItemDto[]

  @ApiPropertyOptional({
    nullable: true,
    description: 'Cursor para a próxima página (null se for a última página)',
    example:
      'eyJjcmVhdGVkQXQiOiIyMDI2LTA5LTIyVDIxOjQxOjAwLjAwMFoiLCJpZCI6ImEwZWViYzk5LTljMGItNGVmOC1iYjZkLTZiYjliZDM4MGExMSJ9',
  })
  nextCursor: string | null

  @ApiProperty({
    example: true,
    description: 'Indica se existem mais produtos após o cursor atual',
  })
  hasMore: boolean

  @ApiProperty({ example: 10, description: 'Limite de itens solicitados' })
  limit: number
}
