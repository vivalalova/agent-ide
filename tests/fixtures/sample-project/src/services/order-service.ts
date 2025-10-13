/**
 * Order Service
 */

import { Order, OrderID, CreateOrderData, UpdateOrderData, OrderStatus, PaymentStatus } from '../types/order';
import { UserID } from '../types/user';
import { ProductID } from '../types/product';
import { ApiResponse, ApiError } from '../types/api';
import { OrderModel } from '../models/order-model';
import { UserService } from './user-service';
import { ProductService } from './product-service';

export class OrderService {
  private orders: Map<OrderID, OrderModel> = new Map();
  private orderCounter: number = 1000;

  constructor(
    private userService: UserService,
    private productService: ProductService
  ) {}

  async createOrder(data: CreateOrderData): Promise<ApiResponse<Order>> {
    try {
      // 驗證使用者存在
      const userResult = await this.userService.getUser(data.userId);
      if (!userResult.success) {
        return this.errorResponse('USER_NOT_FOUND', 'User not found');
      }

      // 驗證產品存在且庫存足夠
      for (const item of data.items) {
        const productResult = await this.productService.getProduct(item.productId);
        if (!productResult.success) {
          return this.errorResponse('PRODUCT_NOT_FOUND', `Product ${item.productId} not found`);
        }

        const product = productResult.data;
        if (product.stock < item.quantity) {
          return this.errorResponse('INSUFFICIENT_STOCK', `Insufficient stock for product ${product.name}`);
        }
      }

      // 建立訂單
      const order: Order = {
        ...data,
        id: this.generateId(),
        orderNumber: this.generateOrderNumber(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const orderModel = new OrderModel(order);
      const validation = orderModel.validate();

      if (!validation.isValid) {
        return this.errorResponse('VALIDATION_ERROR', 'Order validation failed', validation);
      }

      // 減少庫存
      for (const item of order.items) {
        await this.productService.updateStock(item.productId, -item.quantity);
      }

      this.orders.set(order.id, orderModel);
      return this.successResponse(order);
    } catch (error) {
      return this.errorResponse('CREATE_FAILED', 'Failed to create order', error);
    }
  }

  async getOrder(orderId: OrderID): Promise<ApiResponse<Order>> {
    const orderModel = this.orders.get(orderId);
    if (!orderModel) {
      return this.errorResponse('ORDER_NOT_FOUND', `Order ${orderId} not found`);
    }

    return this.successResponse(orderModel.getData());
  }

  async updateOrderStatus(orderId: OrderID, updates: UpdateOrderData): Promise<ApiResponse<Order>> {
    const orderModel = this.orders.get(orderId);
    if (!orderModel) {
      return this.errorResponse('ORDER_NOT_FOUND', `Order ${orderId} not found`);
    }

    orderModel.update({ ...updates, updatedAt: new Date() });
    return this.successResponse(orderModel.getData());
  }

  async cancelOrder(orderId: OrderID): Promise<ApiResponse<Order>> {
    const orderModel = this.orders.get(orderId);
    if (!orderModel) {
      return this.errorResponse('ORDER_NOT_FOUND', `Order ${orderId} not found`);
    }

    if (!orderModel.canCancel()) {
      return this.errorResponse('CANNOT_CANCEL', 'Order cannot be cancelled');
    }

    // 恢復庫存
    const order = orderModel.getData();
    for (const item of order.items) {
      await this.productService.updateStock(item.productId, item.quantity);
    }

    orderModel.update({
      status: OrderStatus.Cancelled,
      updatedAt: new Date()
    });

    return this.successResponse(orderModel.getData());
  }

  async listOrdersByUser(userId: UserID): Promise<ApiResponse<Order[]>> {
    const userOrders: Order[] = [];
    for (const orderModel of this.orders.values()) {
      const order = orderModel.getData();
      if (order.userId === userId) {
        userOrders.push(order);
      }
    }

    return this.successResponse(userOrders);
  }

  async listOrdersByStatus(status: OrderStatus): Promise<ApiResponse<Order[]>> {
    const statusOrders: Order[] = [];
    for (const orderModel of this.orders.values()) {
      const order = orderModel.getData();
      if (order.status === status) {
        statusOrders.push(order);
      }
    }

    return this.successResponse(statusOrders);
  }

  async shipOrder(orderId: OrderID): Promise<ApiResponse<Order>> {
    const orderModel = this.orders.get(orderId);
    if (!orderModel) {
      return this.errorResponse('ORDER_NOT_FOUND', `Order ${orderId} not found`);
    }

    if (!orderModel.ship()) {
      return this.errorResponse('CANNOT_SHIP', 'Order cannot be shipped');
    }

    return this.successResponse(orderModel.getData());
  }

  async deliverOrder(orderId: OrderID): Promise<ApiResponse<Order>> {
    const orderModel = this.orders.get(orderId);
    if (!orderModel) {
      return this.errorResponse('ORDER_NOT_FOUND', `Order ${orderId} not found`);
    }

    if (!orderModel.deliver()) {
      return this.errorResponse('CANNOT_DELIVER', 'Order cannot be delivered');
    }

    return this.successResponse(orderModel.getData());
  }

  private generateId(): string {
    return `order_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private generateOrderNumber(): string {
    const orderNum = this.orderCounter++;
    return `ORD${String(orderNum).padStart(8, '0')}`;
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
