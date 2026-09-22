export enum OrderStatus {
  ACCEPTED = 'ACCEPTED',
  PROCESSING = 'PROCESSING',
  BILLED = 'BILLED',
  FAILED = 'FAILED',
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  totalAmount: number;
  idempotencyKey: string;
  failureReason?: string;
  items: OrderItem[];
  createdAt: Date;
  updatedAt: Date;
}

