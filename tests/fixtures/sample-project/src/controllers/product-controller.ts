/**
 * Product Controller
 */

import { Product, CreateProductData, UpdateProductData } from '../types/product';
import { ApiResponse, PaginatedResponse, ListQueryParams } from '../types/api';
import { BaseController } from './base-controller';
import { ProductService } from '../services/product-service';

export class ProductController extends BaseController {
  constructor(private productService: ProductService) {
    super();
  }

  async create(data: CreateProductData): Promise<ApiResponse<Product>> {
    try {
      return await this.productService.createProduct(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(productId: string): Promise<ApiResponse<Product>> {
    try {
      return await this.productService.getProduct(productId);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(productId: string, updates: UpdateProductData): Promise<ApiResponse<Product>> {
    try {
      return await this.productService.updateProduct(productId, updates);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(productId: string): Promise<ApiResponse<boolean>> {
    try {
      return await this.productService.deleteProduct(productId);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async list(params?: ListQueryParams): Promise<PaginatedResponse<Product>> {
    try {
      return await this.productService.listProducts(params);
    } catch (error) {
      return this.handleError(error) as PaginatedResponse<Product>;
    }
  }
}
