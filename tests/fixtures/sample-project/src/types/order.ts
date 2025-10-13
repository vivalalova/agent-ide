/**
 * Order 相關型別定義
 */

import { ProductID } from './product';
import { UserID } from './user';

export enum OrderStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Processing = 'processing',
  Shipped = 'shipped',
  Delivered = 'delivered',
  Cancelled = 'cancelled',
  Refunded = 'refunded'
}

export enum PaymentMethod {
  CreditCard = 'credit_card',
  DebitCard = 'debit_card',
  PayPal = 'paypal',
  BankTransfer = 'bank_transfer',
  Cash = 'cash'
}

export enum PaymentStatus {
  Pending = 'pending',
  Paid = 'paid',
  Failed = 'failed',
  Refunded = 'refunded'
}

export interface OrderItem {
  productId: ProductID;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  variantId?: string;
}

export interface ShippingAddress {
  recipientName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone: string;
}

export interface PaymentInfo {
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  paidAt?: Date;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: UserID;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  shippingFee: number;
  total: number;
  status: OrderStatus;
  shippingAddress: ShippingAddress;
  payment: PaymentInfo;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
}

export type OrderID = string;

export type CreateOrderData = Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'shippedAt' | 'deliveredAt'>;

export type UpdateOrderData = Partial<Pick<Order, 'status' | 'notes' | 'shippedAt' | 'deliveredAt'>>;

export type OrderSummary = Pick<Order, 'id' | 'orderNumber' | 'userId' | 'total' | 'status' | 'createdAt'>;
