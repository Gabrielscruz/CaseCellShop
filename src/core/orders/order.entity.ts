export enum OrderStatus {
  ACCEPTED = 'ACCEPTED',
  PROCESSING = 'PROCESSING',
  BILLED = 'BILLED',
  FAILED = 'FAILED',
}

export interface OrderItem {
  productId: string
  quantity: number
  unitPrice: number
}

export interface Order {
  id: string
  status: OrderStatus
  totalAmount: number
  idempotencyKey?: string | null
  failureReason?: string | null
  items: OrderItem[]
  createdAt: Date
  updatedAt: Date
}

