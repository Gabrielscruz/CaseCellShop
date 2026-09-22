import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './postgres.pool';
import {
  CreateOrderData,
  IOrderRepository,
} from '../../core/orders/order.repository.interface';
import { Order, OrderStatus } from '../../core/orders/order.entity';

@Injectable()
export class PgOrderRepository implements IOrderRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(data: CreateOrderData): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const insertOrderQuery = `
        INSERT INTO orders (id, status, total_amount, idempotency_key, created_at, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, status, total_amount, idempotency_key, created_at, updated_at;
      `;
      const orderRes = await client.query(insertOrderQuery, [
        data.id,
        OrderStatus.ACCEPTED,
        data.totalAmount,
        data.idempotencyKey,
      ]);

      const insertItemQuery = `
        INSERT INTO order_items (order_id, product_id, quantity, unit_price)
        VALUES ($1, $2, $3, $4);
      `;
      for (const item of data.items) {
        await client.query(insertItemQuery, [
          data.id,
          item.productId,
          item.quantity,
          item.unitPrice,
        ]);
      }

      await client.query('COMMIT');

      const row = orderRes.rows[0];
      return {
        id: row.id,
        status: row.status as OrderStatus,
        totalAmount: parseFloat(row.total_amount),
        idempotencyKey: row.idempotency_key,
        items: data.items,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<Order | null> {
    const orderQuery = `SELECT * FROM orders WHERE id = $1;`;
    const orderResult = await this.pool.query(orderQuery, [id]);
    if (orderResult.rows.length === 0) return null;

    const row = orderResult.rows[0];
    const itemsQuery = `SELECT product_id, quantity, unit_price FROM order_items WHERE order_id = $1;`;
    const itemsResult = await this.pool.query(itemsQuery, [id]);

    return {
      id: row.id,
      status: row.status as OrderStatus,
      totalAmount: parseFloat(row.total_amount),
      idempotencyKey: row.idempotency_key,
      failureReason: row.failure_reason,
      items: itemsResult.rows.map((item) => ({
        productId: item.product_id,
        quantity: parseInt(item.quantity, 10),
        unitPrice: parseFloat(item.unit_price),
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async findByIdempotencyKey(key: string): Promise<Order | null> {
    const orderQuery = `SELECT * FROM orders WHERE idempotency_key = $1;`;
    const orderResult = await this.pool.query(orderQuery, [key]);
    if (orderResult.rows.length === 0) return null;

    const row = orderResult.rows[0];
    const itemsQuery = `SELECT product_id, quantity, unit_price FROM order_items WHERE order_id = $1;`;
    const itemsResult = await this.pool.query(itemsQuery, [row.id]);

    return {
      id: row.id,
      status: row.status as OrderStatus,
      totalAmount: parseFloat(row.total_amount),
      idempotencyKey: row.idempotency_key,
      failureReason: row.failure_reason,
      items: itemsResult.rows.map((item) => ({
        productId: item.product_id,
        quantity: parseInt(item.quantity, 10),
        unitPrice: parseFloat(item.unit_price),
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateStatus(id: string, status: OrderStatus, failureReason?: string): Promise<void> {
    const query = `
      UPDATE orders 
      SET status = $2, failure_reason = $3, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1;
    `;
    await this.pool.query(query, [id, status, failureReason || null]);
  }
}

