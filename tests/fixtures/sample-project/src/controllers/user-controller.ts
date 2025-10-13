/**
 * User Controller
 */

import { User, CreateUserData, UpdateUserData } from '../types/user';
import { ApiResponse } from '../types/api';
import { BaseController } from './base-controller';
import { UserService } from '../services/user-service';

export class UserController extends BaseController {
  constructor(private userService: UserService) {
    super();
  }

  async create(data: CreateUserData): Promise<ApiResponse<User>> {
    try {
      return await this.userService.createUser(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(userId: string): Promise<ApiResponse<User>> {
    try {
      return await this.userService.getUser(userId);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(userId: string, updates: UpdateUserData): Promise<ApiResponse<User>> {
    try {
      return await this.userService.updateUser(userId, updates);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(userId: string): Promise<ApiResponse<boolean>> {
    try {
      return await this.userService.deleteUser(userId);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async list(): Promise<ApiResponse<User[]>> {
    try {
      return await this.userService.listUsers();
    } catch (error) {
      return this.handleError(error);
    }
  }
}
