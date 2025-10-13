/**
 * Product Model
 */

import { Product, ProductStatus, ProductVariant } from '../types/product';
import { ValidationResult, ValidationError } from '../types/common';
import { BaseModel } from './base-model';

export class ProductModel extends BaseModel<Product> {
  constructor(product: Product) {
    super(product);
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    // 驗證必填欄位
    const nameError = this.validateRequired('name', 'Product Name');
    if (nameError) {
      errors.push(nameError);
    }

    const skuError = this.validateRequired('sku', 'SKU');
    if (skuError) {
      errors.push(skuError);
    }

    // 驗證價格
    if (this.data.price < 0) {
      errors.push({
        field: 'price',
        message: 'Price must be greater than or equal to 0',
        value: this.data.price
      });
    }

    // 驗證庫存
    if (this.data.stock < 0) {
      errors.push({
        field: 'stock',
        message: 'Stock must be greater than or equal to 0',
        value: this.data.stock
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  isAvailable(): boolean {
    return this.data.status === ProductStatus.Available && this.data.stock > 0;
  }

  isOutOfStock(): boolean {
    return this.data.stock === 0;
  }

  getTotalStock(): number {
    let total = this.data.stock;
    if (this.data.variants) {
      total += this.data.variants.reduce((sum, variant) => sum + variant.stock, 0);
    }
    return total;
  }

  getVariant(variantId: string): ProductVariant | undefined {
    return this.data.variants?.find(v => v.id === variantId);
  }

  addVariant(variant: ProductVariant): void {
    if (!this.data.variants) {
      this.data.variants = [];
    }
    this.data.variants.push(variant);
  }

  getPrimaryImage(): string | undefined {
    return this.data.images.find(img => img.isPrimary)?.url;
  }
}
