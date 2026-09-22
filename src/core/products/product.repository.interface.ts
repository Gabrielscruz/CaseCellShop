import { Product } from './product.entity';

export interface FindProductsParams {
  page: number;
  limit: number;
}

export interface PaginatedProducts {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IProductRepository {
  findPaginated(params: FindProductsParams): Promise<PaginatedProducts>;
  findById(id: string): Promise<Product | null>;
  decrementStockAtomic(productId: string, quantity: number): Promise<boolean>;
  incrementStockAtomic(productId: string, quantity: number): Promise<boolean>;
}

export const PRODUCT_REPOSITORY = Symbol('IProductRepository');

