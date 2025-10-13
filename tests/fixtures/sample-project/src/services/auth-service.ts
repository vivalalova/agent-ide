/**
 * Auth Service
 */

import { User, UserRole, UserStatus } from '../types/user';
import { ApiResponse, ApiError } from '../types/api';
import { ValidationError } from '../types/common';
import { UserService } from './user-service';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthToken {
  token: string;
  expiresAt: Date;
  userId: string;
}

export interface AuthSession {
  user: User;
  token: AuthToken;
}

export class AuthService {
  private sessions: Map<string, AuthSession> = new Map();

  constructor(private userService: UserService) {}

  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthSession>> {
    try {
      // 驗證輸入
      const validation = this.validateCredentials(credentials);
      if (!validation.isValid) {
        return this.errorResponse('VALIDATION_ERROR', 'Invalid credentials', validation.errors);
      }

      // 查找使用者
      const user = this.userService.findByEmail(credentials.email);
      if (!user) {
        return this.errorResponse('AUTH_FAILED', 'Invalid email or password');
      }

      // 檢查使用者狀態
      if (user.status !== UserStatus.Active) {
        return this.errorResponse('USER_INACTIVE', 'User account is not active');
      }

      // 驗證密碼（簡化版，實際應使用 bcrypt）
      // const isPasswordValid = await this.verifyPassword(credentials.password, user.passwordHash);
      // if (!isPasswordValid) {
      //   return this.errorResponse('AUTH_FAILED', 'Invalid email or password');
      // }

      // 建立 session
      const token = this.generateToken();
      const authToken: AuthToken = {
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        userId: user.id
      };

      const session: AuthSession = {
        user,
        token: authToken
      };

      this.sessions.set(token, session);

      return this.successResponse(session);
    } catch (error) {
      return this.errorResponse('LOGIN_FAILED', 'Login failed', error);
    }
  }

  async logout(token: string): Promise<ApiResponse<boolean>> {
    if (!this.sessions.has(token)) {
      return this.errorResponse('SESSION_NOT_FOUND', 'Session not found');
    }

    this.sessions.delete(token);
    return this.successResponse(true);
  }

  async validateToken(token: string): Promise<ApiResponse<User>> {
    const session = this.sessions.get(token);
    if (!session) {
      return this.errorResponse('INVALID_TOKEN', 'Token is invalid');
    }

    if (session.token.expiresAt < new Date()) {
      this.sessions.delete(token);
      return this.errorResponse('TOKEN_EXPIRED', 'Token has expired');
    }

    return this.successResponse(session.user);
  }

  async checkPermission(token: string, requiredRole: UserRole): Promise<boolean> {
    const result = await this.validateToken(token);
    if (!result.success) {
      return false;
    }

    const user = result.data;
    return this.hasPermission(user.role, requiredRole);
  }

  private hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
    const roleHierarchy: Record<UserRole, number> = {
      [UserRole.Guest]: 0,
      [UserRole.User]: 1,
      [UserRole.Manager]: 2,
      [UserRole.Admin]: 3
    };

    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
  }

  private validateCredentials(credentials: LoginCredentials): { isValid: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    if (!credentials.email) {
      errors.push({ field: 'email', message: 'Email is required' });
    }

    if (!credentials.password) {
      errors.push({ field: 'password', message: 'Password is required' });
    }

    if (credentials.password && credentials.password.length < 6) {
      errors.push({ field: 'password', message: 'Password must be at least 6 characters' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private generateToken(): string {
    return `token_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
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
