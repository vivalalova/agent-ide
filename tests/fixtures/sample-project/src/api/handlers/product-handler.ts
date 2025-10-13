/**
 * Product API Handler
 */

import { Product, CreateProductData, UpdateProductData } from '../../types/product';
import { ApiResponse, PaginatedResponse, ListQueryParams } from '../../types/api';
import { ProductService } from '../../services/product-service';

export class ProductHandler {
  constructor(private productService: ProductService) {}

  async handleCreateProduct(data: CreateProductData): Promise<ApiResponse<Product>> {
    return await this.productService.createProduct(data);
  }

  async handleGetProduct(productId: string): Promise<ApiResponse<Product>> {
    return await this.productService.getProduct(productId);
  }

  async handleUpdateProduct(productId: string, updates: UpdateProductData): Promise<ApiResponse<Product>> {
    return await this.productService.updateProduct(productId, updates);
  }

  async handleDeleteProduct(productId: string): Promise<ApiResponse<boolean>> {
    return await this.productService.deleteProduct(productId);
  }

  async handleListProducts(params?: ListQueryParams): Promise<PaginatedResponse<Product>> {
    return await this.productService.listProducts(params);
  }
}
