import { Product } from './product.entity'

export interface CursorData {
  createdAt: Date
  id: string
}

export interface FindProductsParams {
  limit: number
  cursor?: CursorData
}

export interface CursorPaginatedProducts {
  items: Product[]
  nextCursor: string | null
  hasMore: boolean
  limit: number
}

export interface IProductRepository {
  findPaginated(params: FindProductsParams): Promise<CursorPaginatedProducts>
  findById(id: string): Promise<Product | null>
  decrementStockAtomic(productId: string, quantity: number): Promise<boolean>
  incrementStockAtomic(productId: string, quantity: number): Promise<boolean>
}

export const PRODUCT_REPOSITORY = Symbol('IProductRepository')
