/**
 * Product Service
 */

import { Product, ProductID, CreateProductData, UpdateProductData, ProductCategory, ProductStatus } from '../types/product';
import { ApiResponse, ApiError, PaginatedResponse, PaginationMeta, ListQueryParams } from '../types/api';
import { ProductModel } from '../models/product-model';

export class ProductService {
  private products: Map<ProductID, ProductModel> = new Map();

  async createProduct(data: CreateProductData): Promise<ApiResponse<Product>> {
    try {
      const product: Product = {
        ...data,
        id: this.generateId(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const productModel = new ProductModel(product);
      const validation = productModel.validate();

      if (!validation.isValid) {
        return this.errorResponse('VALIDATION_ERROR', 'Product validation failed', validation);
      }

      // 檢查 SKU 是否已存在
      if (this.findBySku(product.sku)) {
        return this.errorResponse('SKU_EXISTS', 'SKU already exists');
      }

      this.products.set(product.id, productModel);
      return this.successResponse(product);
    } catch (error) {
      return this.errorResponse('CREATE_FAILED', 'Failed to create product', error);
    }
  }

  async getProduct(productId: ProductID): Promise<ApiResponse<Product>> {
    const productModel = this.products.get(productId);
    if (!productModel) {
      return this.errorResponse('PRODUCT_NOT_FOUND', `Product ${productId} not found`);
    }

    return this.successResponse(productModel.getData());
  }

  async updateProduct(productId: ProductID, updates: UpdateProductData): Promise<ApiResponse<Product>> {
    const productModel = this.products.get(productId);
    if (!productModel) {
      return this.errorResponse('PRODUCT_NOT_FOUND', `Product ${productId} not found`);
    }

    productModel.update({ ...updates, updatedAt: new Date() });

    const validation = productModel.validate();
    if (!validation.isValid) {
      return this.errorResponse('VALIDATION_ERROR', 'Product validation failed', validation);
    }

    return this.successResponse(productModel.getData());
  }

  async deleteProduct(productId: ProductID): Promise<ApiResponse<boolean>> {
    if (!this.products.has(productId)) {
      return this.errorResponse('PRODUCT_NOT_FOUND', `Product ${productId} not found`);
    }

    this.products.delete(productId);
    return this.successResponse(true);
  }

  async listProducts(params?: ListQueryParams): Promise<PaginatedResponse<Product>> {
    const allProducts = Array.from(this.products.values()).map(model => model.getData());

    // 簡單分頁實作
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 10;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const paginatedProducts = allProducts.slice(startIndex, endIndex);
    const totalItems = allProducts.length;
    const totalPages = Math.ceil(totalItems / pageSize);

    const pagination: PaginationMeta = {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    };

    return {
      success: true,
      data: paginatedProducts,
      pagination,
      timestamp: Date.now()
    };
  }

  findBySku(sku: string): Product | undefined {
    for (const productModel of this.products.values()) {
      const product = productModel.getData();
      if (product.sku === sku) {
        return product;
      }
    }
    return undefined;
  }

  findByCategory(category: ProductCategory): Product[] {
    const result: Product[] = [];
    for (const productModel of this.products.values()) {
      const product = productModel.getData();
      if (product.category === category) {
        result.push(product);
      }
    }
    return result;
  }

  findAvailableProducts(): Product[] {
    const result: Product[] = [];
    for (const productModel of this.products.values()) {
      if (productModel.isAvailable()) {
        result.push(productModel.getData());
      }
    }
    return result;
  }

  async updateStock(productId: ProductID, quantity: number): Promise<ApiResponse<Product>> {
    const productModel = this.products.get(productId);
    if (!productModel) {
      return this.errorResponse('PRODUCT_NOT_FOUND', `Product ${productId} not found`);
    }

    const product = productModel.getData();
    const newStock = product.stock + quantity;

    if (newStock < 0) {
      return this.errorResponse('INSUFFICIENT_STOCK', 'Insufficient stock');
    }

    productModel.update({
      stock: newStock,
      status: newStock === 0 ? ProductStatus.OutOfStock : ProductStatus.Available,
      updatedAt: new Date()
    });

    return this.successResponse(productModel.getData());
  }

  private generateId(): string {
    return `prod_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private successResponse<T>(data: T): ApiResponse<T> {
    return {
      success: true,
      data,
      timestamp: Date.now()
    };
  }

  private errorResponse(code: string, message: string, details?: unknown): ApiResponse<never> {
    const error: ApiError = {
      code,
      message,
      details: details as Record<string, unknown>
    };

    return {
      success: false,
      data: undefined as never,
      error,
      timestamp: Date.now()
    };
  }
}
