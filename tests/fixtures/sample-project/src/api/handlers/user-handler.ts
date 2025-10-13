/**
 * User API Handler
 */

import { User, CreateUserData, UpdateUserData } from '../../types/user';
import { ApiResponse } from '../../types/api';
import { UserService } from '../../services/user-service';

export class UserHandler {
  constructor(private userService: UserService) {}

  async handleCreateUser(data: CreateUserData): Promise<ApiResponse<User>> {
    return await this.userService.createUser(data);
  }

  async handleGetUser(userId: string): Promise<ApiResponse<User>> {
    return await this.userService.getUser(userId);
  }

  async handleUpdateUser(userId: string, updates: UpdateUserData): Promise<ApiResponse<User>> {
    return await this.userService.updateUser(userId, updates);
  }

  async handleDeleteUser(userId: string): Promise<ApiResponse<boolean>> {
    return await this.userService.deleteUser(userId);
  }

  async handleListUsers(): Promise<ApiResponse<User[]>> {
    return await this.userService.listUsers();
  }
}
