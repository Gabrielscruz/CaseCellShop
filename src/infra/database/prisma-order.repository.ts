import { Injectable } from '@nestjs/common'
import { PrismaService } from './prisma.service'
import {
  CreateOrderData,
  IOrderRepository,
} from '../../core/orders/order.repository.interface'
import { Order, OrderStatus } from '../../core/orders/order.entity'

@Injectable()
export class PrismaOrderRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateOrderData): Promise<Order> {
    const createdOrder = await this.prisma.order.create({
      data: {
        id: data.id,
        totalAmount: data.totalAmount,
        idempotencyKey: data.idempotencyKey,
        status: OrderStatus.ACCEPTED,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
      include: {
        items: true,
      },
    })

    return {
      id: createdOrder.id,
      status: createdOrder.status as OrderStatus,
      totalAmount: Number(createdOrder.totalAmount),
      idempotencyKey: createdOrder.idempotencyKey,
      items: createdOrder.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
      createdAt: createdOrder.createdAt,
      updatedAt: createdOrder.updatedAt,
    }
  }

  async findById(id: string): Promise<Order | null> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    })

    if (!order) return null

    return {
      id: order.id,
      status: order.status as OrderStatus,
      totalAmount: Number(order.totalAmount),
      idempotencyKey: order.idempotencyKey,
      failureReason: order.failureReason || undefined,
      items: order.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }
  }

  async findByIdempotencyKey(key: string): Promise<Order | null> {
    const order = await this.prisma.order.findUnique({
      where: { idempotencyKey: key },
      include: { items: true },
    })

    if (!order) return null

    return {
      id: order.id,
      status: order.status as OrderStatus,
      totalAmount: Number(order.totalAmount),
      idempotencyKey: order.idempotencyKey,
      failureReason: order.failureReason || undefined,
      items: order.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    failureReason?: string,
  ): Promise<void> {
    await this.prisma.order.update({
      where: { id },
      data: {
        status,
        failureReason: failureReason || null,
      },
    })
  }
}

