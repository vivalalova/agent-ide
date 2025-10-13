/**
 * Payment Service
 */

import { Order, OrderID, PaymentMethod, PaymentStatus, PaymentInfo } from '../types/order';
import { UserID } from '../types/user';
import { ApiResponse, ApiError } from '../types/api';

export interface PaymentRequest {
  orderId: OrderID;
  userId: UserID;
  amount: number;
  method: PaymentMethod;
}

export interface PaymentResult {
  transactionId: string;
  status: PaymentStatus;
  amount: number;
  paidAt: Date;
}

export class PaymentService {
  private transactions: Map<string, PaymentResult> = new Map();

  async processPayment(request: PaymentRequest): Promise<ApiResponse<PaymentResult>> {
    try {
      // 驗證支付金額
      if (request.amount <= 0) {
        return this.errorResponse('INVALID_AMOUNT', 'Payment amount must be greater than 0');
      }

      // 模擬支付處理
      const transactionId = this.generateTransactionId();
      const paymentResult: PaymentResult = {
        transactionId,
        status: PaymentStatus.Paid,
        amount: request.amount,
        paidAt: new Date()
      };

      this.transactions.set(transactionId, paymentResult);
      return this.successResponse(paymentResult);
    } catch (error) {
      return this.errorResponse('PAYMENT_FAILED', 'Payment processing failed', error);
    }
  }

  async refundPayment(transactionId: string, amount: number): Promise<ApiResponse<PaymentResult>> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return this.errorResponse('TRANSACTION_NOT_FOUND', 'Transaction not found');
    }

    if (amount > transaction.amount) {
      return this.errorResponse('INVALID_REFUND_AMOUNT', 'Refund amount exceeds payment amount');
    }

    const refundResult: PaymentResult = {
      transactionId: this.generateTransactionId(),
      status: PaymentStatus.Refunded,
      amount,
      paidAt: new Date()
    };

    this.transactions.set(refundResult.transactionId, refundResult);
    return this.successResponse(refundResult);
  }

  async getTransaction(transactionId: string): Promise<ApiResponse<PaymentResult>> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return this.errorResponse('TRANSACTION_NOT_FOUND', 'Transaction not found');
    }

    return this.successResponse(transaction);
  }

  async validatePaymentMethod(method: PaymentMethod): Promise<boolean> {
    // 模擬支付方式驗證
    const validMethods = [
      PaymentMethod.CreditCard,
      PaymentMethod.DebitCard,
      PaymentMethod.PayPal,
      PaymentMethod.BankTransfer
    ];

    return validMethods.includes(method);
  }

  private generateTransactionId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
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
