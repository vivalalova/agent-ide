import type { DatabaseConnection } from './database';

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export class ProductService {
  constructor(private database: DatabaseConnection) {}

  async getProduct(id: string): Promise<Product | null> {
    return {
      id,
      name: 'Test Product',
      price: 100,
      stock: 10
    };
  }

  async createProduct(data: Omit<Product, 'id'>): Promise<Product> {
    return {
      id: '1',
      ...data
    };
  }
}