/**
 * Notification Service
 */

import { User, UserID } from '../types/user';
import { Order, OrderStatus } from '../types/order';
import { ApiResponse } from '../types/api';

export enum NotificationType {
  Email = 'email',
  SMS = 'sms',
  Push = 'push'
}

export interface Notification {
  id: string;
  userId: UserID;
  type: NotificationType;
  subject: string;
  message: string;
  sentAt: Date;
  read: boolean;
}

export class NotificationService {
  private notifications: Map<string, Notification> = new Map();

  async sendOrderConfirmation(user: User, order: Order): Promise<ApiResponse<Notification>> {
    const notification: Notification = {
      id: this.generateId(),
      userId: user.id,
      type: NotificationType.Email,
      subject: `Order Confirmation - ${order.orderNumber}`,
      message: `Your order ${order.orderNumber} has been confirmed. Total: $${order.total}`,
      sentAt: new Date(),
      read: false
    };

    this.notifications.set(notification.id, notification);
    return this.successResponse(notification);
  }

  async sendOrderStatusUpdate(user: User, order: Order, status: OrderStatus): Promise<ApiResponse<Notification>> {
    const statusMessages: Record<OrderStatus, string> = {
      [OrderStatus.Pending]: 'Your order is pending',
      [OrderStatus.Confirmed]: 'Your order has been confirmed',
      [OrderStatus.Processing]: 'Your order is being processed',
      [OrderStatus.Shipped]: 'Your order has been shipped',
      [OrderStatus.Delivered]: 'Your order has been delivered',
      [OrderStatus.Cancelled]: 'Your order has been cancelled',
      [OrderStatus.Refunded]: 'Your order has been refunded'
    };

    const notification: Notification = {
      id: this.generateId(),
      userId: user.id,
      type: NotificationType.Email,
      subject: `Order Status Update - ${order.orderNumber}`,
      message: statusMessages[status],
      sentAt: new Date(),
      read: false
    };

    this.notifications.set(notification.id, notification);
    return this.successResponse(notification);
  }

  async sendWelcomeEmail(user: User): Promise<ApiResponse<Notification>> {
    const notification: Notification = {
      id: this.generateId(),
      userId: user.id,
      type: NotificationType.Email,
      subject: 'Welcome to Our Platform',
      message: `Welcome ${user.firstName}! Thank you for joining us.`,
      sentAt: new Date(),
      read: false
    };

    this.notifications.set(notification.id, notification);
    return this.successResponse(notification);
  }

  async getUserNotifications(userId: UserID): Promise<ApiResponse<Notification[]>> {
    const userNotifications: Notification[] = [];
    for (const notification of this.notifications.values()) {
      if (notification.userId === userId) {
        userNotifications.push(notification);
      }
    }

    return this.successResponse(userNotifications);
  }

  async markAsRead(notificationId: string): Promise<ApiResponse<Notification>> {
    const notification = this.notifications.get(notificationId);
    if (!notification) {
      return this.errorResponse('NOTIFICATION_NOT_FOUND', 'Notification not found');
    }

    notification.read = true;
    return this.successResponse(notification);
  }

  private generateId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private successResponse<T>(data: T): ApiResponse<T> {
    return {
      success: true,
      data,
      timestamp: Date.now()
    };
  }

  private errorResponse(code: string, message: string): ApiResponse<never> {
    return {
      success: false,
      data: undefined as never,
      error: { code, message },
      timestamp: Date.now()
    };
  }
}
