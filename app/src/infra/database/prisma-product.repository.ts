import { Injectable } from '@nestjs/common'
import { PrismaService } from './prisma.service'
import {
  CursorPaginatedProducts,
  FindProductsParams,
  IProductRepository,
} from '../../core/products/product.repository.interface'
import { Product } from '../../core/products/product.entity'
import { encodeCursor } from '../../utils/cursor.util'

@Injectable()
export class PrismaProductRepository implements IProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPaginated({
    limit,
    cursor,
  }: FindProductsParams): Promise<CursorPaginatedProducts> {
    const products = await this.prisma.product.findMany({
      take: limit + 1,
      where: cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              {
                createdAt: cursor.createdAt,
                id: { lt: cursor.id },
              },
            ],
          }
        : undefined,
      include: { stock: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })

    const hasMore = products.length > limit
    if (hasMore) {
      products.pop()
    }

    const items: Product[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      price: Number(p.price),
      stockQty: p.stock?.qty ?? 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))

    let nextCursor: string | null = null
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1]
      nextCursor = encodeCursor(lastItem.createdAt, lastItem.id)
    }

    return {
      items,
      nextCursor,
      hasMore,
      limit,
    }
  }

  async findById(id: string): Promise<Product | null> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { stock: true },
    })

    if (!product) return null

    return {
      id: product.id,
      name: product.name,
      description: product.description || '',
      price: Number(product.price),
      stockQty: product.stock?.qty ?? 0,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    }
  }

  async decrementStockAtomic(
    productId: string,
    quantity: number,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const stock = await tx.stock.findUnique({
          where: { productId },
        })

        if (!stock || stock.qty < quantity) {
          return false
        }

        await tx.stock.update({
          where: { productId },
          data: {
            qty: { decrement: quantity },
          },
        })

        return true
      })
    } catch {
      return false
    }
  }

  async incrementStockAtomic(
    productId: string,
    quantity: number,
  ): Promise<boolean> {
    try {
      await this.prisma.stock.update({
        where: { productId },
        data: {
          qty: { increment: quantity },
        },
      })
      return true
    } catch {
      return false
    }
  }
}
