/**
 * Auth Middleware
 */

import { User, UserRole } from '../../types/user';
import { ApiResponse } from '../../types/api';
import { AuthService } from '../../services/auth-service';

export interface AuthContext {
  user: User;
  token: string;
}

export class AuthMiddleware {
  constructor(private authService: AuthService) {}

  async authenticate(token: string): Promise<ApiResponse<AuthContext>> {
    const result = await this.authService.validateToken(token);
    if (!result.success) {
      return {
        success: false,
        data: undefined as never,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        timestamp: Date.now()
      };
    }

    return {
      success: true,
      data: {
        user: result.data,
        token
      },
      timestamp: Date.now()
    };
  }

  async authorize(token: string, requiredRole: UserRole): Promise<ApiResponse<boolean>> {
    const hasPermission = await this.authService.checkPermission(token, requiredRole);
    if (!hasPermission) {
      return {
        success: false,
        data: undefined as never,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        timestamp: Date.now()
      };
    }

    return {
      success: true,
      data: true,
      timestamp: Date.now()
    };
  }
}
