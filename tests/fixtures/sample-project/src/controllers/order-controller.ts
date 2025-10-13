/**
 * Order Controller
 */

import { Order, CreateOrderData, UpdateOrderData, OrderStatus } from '../types/order';
import { ApiResponse } from '../types/api';
import { BaseController } from './base-controller';
import { OrderService } from '../services/order-service';

export class OrderController extends BaseController {
  constructor(private orderService: OrderService) {
    super();
  }

  async create(data: CreateOrderData): Promise<ApiResponse<Order>> {
    try {
      return await this.orderService.createOrder(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(orderId: string): Promise<ApiResponse<Order>> {
    try {
      return await this.orderService.getOrder(orderId);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateStatus(orderId: string, updates: UpdateOrderData): Promise<ApiResponse<Order>> {
    try {
      return await this.orderService.updateOrderStatus(orderId, updates);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async cancel(orderId: string): Promise<ApiResponse<Order>> {
    try {
      return await this.orderService.cancelOrder(orderId);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async ship(orderId: string): Promise<ApiResponse<Order>> {
    try {
      return await this.orderService.shipOrder(orderId);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deliver(orderId: string): Promise<ApiResponse<Order>> {
    try {
      return await this.orderService.deliverOrder(orderId);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listByStatus(status: OrderStatus): Promise<ApiResponse<Order[]>> {
    try {
      return await this.orderService.listOrdersByStatus(status);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
