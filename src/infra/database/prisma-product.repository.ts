import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  FindProductsParams,
  IProductRepository,
  PaginatedProducts,
} from '../../core/products/product.repository.interface';
import { Product } from '../../core/products/product.entity';

@Injectable()
export class PrismaProductRepository implements IProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPaginated({ page, limit }: FindProductsParams): Promise<PaginatedProducts> {
    const skip = (page - 1) * limit;

    const [total, products] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.product.findMany({
        skip,
        take: limit,
        include: { stock: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const items: Product[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      price: Number(p.price),
      stockQty: p.stock?.qty ?? 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<Product | null> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { stock: true },
    });

    if (!product) return null;

    return {
      id: product.id,
      name: product.name,
      description: product.description || '',
      price: Number(product.price),
      stockQty: product.stock?.qty ?? 0,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  /**
   * Baixa Atômica de Estoque via Prisma Client:
   * Utiliza transação interativa ($transaction) e operador nativo { decrement: quantity } do Prisma.
   * Totalmente baseado no Prisma Client, sem uso de raw queries.
   */
  async decrementStockAtomic(productId: string, quantity: number): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const stock = await tx.stock.findUnique({
          where: { productId },
        });

        if (!stock || stock.qty < quantity) {
          return false;
        }

        await tx.stock.update({
          where: { productId },
          data: {
            qty: { decrement: quantity },
          },
        });

        return true;
      });
    } catch {
      return false;
    }
  }

  /**
   * Transação Compensatória (Padrão SAGA) via Prisma Client:
   * Restitui o estoque usando o operador nativo { increment: quantity } do Prisma.
   */
  async incrementStockAtomic(productId: string, quantity: number): Promise<boolean> {
    try {
      await this.prisma.stock.update({
        where: { productId },
        data: {
          qty: { increment: quantity },
        },
      });
      return true;
    } catch {
      return false;
    }
  }
}

