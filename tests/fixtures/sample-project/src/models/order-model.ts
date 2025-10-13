/**
 * Order Model
 */

import { Order, OrderStatus, OrderItem, PaymentStatus } from '../types/order';
import { ValidationResult, ValidationError } from '../types/common';
import { BaseModel } from './base-model';

export class OrderModel extends BaseModel<Order> {
  constructor(order: Order) {
    super(order);
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    // 驗證必填欄位
    const orderNumberError = this.validateRequired('orderNumber', 'Order Number');
    if (orderNumberError) {
      errors.push(orderNumberError);
    }

    // 驗證訂單項目
    if (!this.data.items || this.data.items.length === 0) {
      errors.push({
        field: 'items',
        message: 'Order must have at least one item',
        value: this.data.items
      });
    }

    // 驗證金額
    if (this.data.total < 0) {
      errors.push({
        field: 'total',
        message: 'Total must be greater than or equal to 0',
        value: this.data.total
      });
    }

    // 驗證金額計算
    const calculatedTotal = this.calculateTotal();
    if (Math.abs(this.data.total - calculatedTotal) > 0.01) {
      errors.push({
        field: 'total',
        message: 'Total does not match calculated value',
        value: this.data.total
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  calculateTotal(): number {
    return this.data.subtotal + this.data.tax + this.data.shippingFee;
  }

  calculateSubtotal(): number {
    return this.data.items.reduce((sum, item) => sum + item.totalPrice, 0);
  }

  getItemCount(): number {
    return this.data.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  findItem(productId: string): OrderItem | undefined {
    return this.data.items.find(item => item.productId === productId);
  }

  isPending(): boolean {
    return this.data.status === OrderStatus.Pending;
  }

  isDelivered(): boolean {
    return this.data.status === OrderStatus.Delivered;
  }

  isCancelled(): boolean {
    return this.data.status === OrderStatus.Cancelled;
  }

  isPaid(): boolean {
    return this.data.payment.status === PaymentStatus.Paid;
  }

  canCancel(): boolean {
    return [OrderStatus.Pending, OrderStatus.Confirmed].includes(this.data.status);
  }

  ship(): boolean {
    if (this.data.status !== OrderStatus.Processing) {
      return false;
    }
    this.data.status = OrderStatus.Shipped;
    this.data.shippedAt = new Date();
    return true;
  }

  deliver(): boolean {
    if (this.data.status !== OrderStatus.Shipped) {
      return false;
    }
    this.data.status = OrderStatus.Delivered;
    this.data.deliveredAt = new Date();
    return true;
  }
}
