import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ORDER_REPOSITORY,
  IOrderRepository,
} from '../../../core/orders/order.repository.interface';
import { Order } from '../../../core/orders/order.entity';

@Injectable()
export class GetOrderStatusUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: IOrderRepository,
  ) {}

  async execute(orderId: string): Promise<Order> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Pedido com ID ${orderId} não encontrado.`);
    }
    return order;
  }
}

