/**
 * User Service
 */

import { User, UserID, CreateUserData, UpdateUserData, UserRole } from '../types/user';
import { ApiResponse, ApiError } from '../types/api';
import { ValidationResult } from '../types/common';
import { UserModel } from '../models/user-model';

export class UserService {
  private users: Map<UserID, UserModel> = new Map();

  async createUser(data: CreateUserData): Promise<ApiResponse<User>> {
    try {
      // 建立 User 物件
      const user: User = {
        ...data,
        id: this.generateId(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // 驗證
      const userModel = new UserModel(user);
      const validation = userModel.validate();

      if (!validation.isValid) {
        return this.errorResponse('VALIDATION_ERROR', 'User validation failed', validation);
      }

      // 檢查 email 是否已存在
      if (this.findByEmail(user.email)) {
        return this.errorResponse('EMAIL_EXISTS', 'Email already exists');
      }

      // 儲存
      this.users.set(user.id, userModel);

      return this.successResponse(user);
    } catch (error) {
      return this.errorResponse('CREATE_FAILED', 'Failed to create user', error);
    }
  }

  async getUser(userId: UserID): Promise<ApiResponse<User>> {
    const userModel = this.users.get(userId);
    if (!userModel) {
      return this.errorResponse('USER_NOT_FOUND', `User ${userId} not found`);
    }

    return this.successResponse(userModel.getData());
  }

  async updateUser(userId: UserID, updates: UpdateUserData): Promise<ApiResponse<User>> {
    const userModel = this.users.get(userId);
    if (!userModel) {
      return this.errorResponse('USER_NOT_FOUND', `User ${userId} not found`);
    }

    userModel.update({ ...updates, updatedAt: new Date() });

    const validation = userModel.validate();
    if (!validation.isValid) {
      return this.errorResponse('VALIDATION_ERROR', 'User validation failed', validation);
    }

    return this.successResponse(userModel.getData());
  }

  async deleteUser(userId: UserID): Promise<ApiResponse<boolean>> {
    if (!this.users.has(userId)) {
      return this.errorResponse('USER_NOT_FOUND', `User ${userId} not found`);
    }

    this.users.delete(userId);
    return this.successResponse(true);
  }

  async listUsers(): Promise<ApiResponse<User[]>> {
    const users = Array.from(this.users.values()).map(model => model.getData());
    return this.successResponse(users);
  }

  findByEmail(email: string): User | undefined {
    for (const userModel of this.users.values()) {
      const user = userModel.getData();
      if (user.email === email) {
        return user;
      }
    }
    return undefined;
  }

  findByRole(role: UserRole): User[] {
    const result: User[] = [];
    for (const userModel of this.users.values()) {
      const user = userModel.getData();
      if (user.role === role) {
        result.push(user);
      }
    }
    return result;
  }

  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
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
