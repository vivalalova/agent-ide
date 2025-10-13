/**
 * Product 相關型別定義
 */

export enum ProductCategory {
  Electronics = 'electronics',
  Clothing = 'clothing',
  Books = 'books',
  Home = 'home',
  Sports = 'sports',
  Food = 'food'
}

export enum ProductStatus {
  Available = 'available',
  OutOfStock = 'out_of_stock',
  Discontinued = 'discontinued'
}

export interface ProductDimensions {
  length: number;
  width: number;
  height: number;
  weight: number;
  unit: 'cm' | 'inch' | 'kg' | 'lb';
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  attributes: Record<string, string>;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  isPrimary: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: ProductCategory;
  status: ProductStatus;
  price: number;
  stock: number;
  sku: string;
  variants?: ProductVariant[];
  images: ProductImage[];
  dimensions?: ProductDimensions;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type ProductID = string;

export type CreateProductData = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;

export type UpdateProductData = Partial<Omit<Product, 'id' | 'createdAt'>>;

export type ProductSummary = Pick<Product, 'id' | 'name' | 'price' | 'stock' | 'status'>;
