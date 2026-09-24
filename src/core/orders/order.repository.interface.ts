import { Order, OrderStatus } from './order.entity'

export interface CreateOrderData {
  id?: string
  totalAmount: number
  idempotencyKey?: string | null
  items: {
    productId: string
    quantity: number
    unitPrice: number
  }[]
}

export interface IOrderRepository {
  create(data: CreateOrderData): Promise<Order>
  findById(id: string): Promise<Order | null>
  findByIdempotencyKey(key: string): Promise<Order | null>
  updateStatus(
    id: string,
    status: OrderStatus,
    failureReason?: string,
  ): Promise<void>
}

export const ORDER_REPOSITORY = Symbol('IOrderRepository')

