import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './postgres.pool';
import {
  FindProductsParams,
  IProductRepository,
  PaginatedProducts,
} from '../../core/products/product.repository.interface';
import { Product } from '../../core/products/product.entity';

@Injectable()
export class PgProductRepository implements IProductRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPaginated({ page, limit }: FindProductsParams): Promise<PaginatedProducts> {
    const offset = (page - 1) * limit;

    const countQuery = 'SELECT COUNT(*) FROM products';
    const countResult = await this.pool.query(countQuery);
    const total = parseInt(countResult.rows[0].count, 10);

    const itemsQuery = `
      SELECT p.id, p.name, p.description, p.price, COALESCE(s.qty, 0) as "stockQty", p.created_at as "createdAt", p.updated_at as "updatedAt"
      FROM products p
      LEFT JOIN stock s ON s.product_id = p.id
      ORDER BY p.id ASC
      LIMIT $1 OFFSET $2;
    `;
    const itemsResult = await this.pool.query(itemsQuery, [limit, offset]);

    const items: Product[] = itemsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      stockQty: parseInt(row.stockQty, 10),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
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
    const query = `
      SELECT p.id, p.name, p.description, p.price, COALESCE(s.qty, 0) as "stockQty", p.created_at as "createdAt", p.updated_at as "updatedAt"
      FROM products p
      LEFT JOIN stock s ON s.product_id = p.id
      WHERE p.id = $1;
    `;
    const result = await this.pool.query(query, [id]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      stockQty: parseInt(row.stockQty, 10),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Baixa Atômica Condicional de Estoque:
   * UPDATE stock SET qty = qty - $1 WHERE product_id = $2 AND qty >= $1 RETURNING qty;
   * Evita race condition e overselling diretamente no motor do PostgreSQL.
   */
  async decrementStockAtomic(productId: string, quantity: number): Promise<boolean> {
    const query = `
      UPDATE stock 
      SET qty = qty - $1, updated_at = CURRENT_TIMESTAMP
      WHERE product_id = $2 AND qty >= $1
      RETURNING qty;
    `;
    const result = await this.pool.query(query, [quantity, productId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Restauração Atômica de Estoque (Transação Compensatória do padrão SAGA)
   */
  async incrementStockAtomic(productId: string, quantity: number): Promise<boolean> {
    const query = `
      UPDATE stock 
      SET qty = qty + $1, updated_at = CURRENT_TIMESTAMP
      WHERE product_id = $2
      RETURNING qty;
    `;
    const result = await this.pool.query(query, [quantity, productId]);
    return (result.rowCount ?? 0) > 0;
  }
}

