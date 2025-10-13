/**
 * User Model
 */

import { User, UserRole, UserStatus } from '../types/user';
import { ValidationResult, ValidationError } from '../types/common';
import { BaseModel } from './base-model';

export class UserModel extends BaseModel<User> {
  constructor(user: User) {
    super(user);
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    // 驗證必填欄位
    const requiredFields: Array<{ field: keyof User; name: string }> = [
      { field: 'email', name: 'Email' },
      { field: 'username', name: 'Username' },
      { field: 'firstName', name: 'First Name' },
      { field: 'lastName', name: 'Last Name' }
    ];

    for (const { field, name } of requiredFields) {
      const error = this.validateRequired(field, name);
      if (error) {
        errors.push(error);
      }
    }

    // 驗證 email 格式
    const emailError = this.validateEmail(this.data.email, 'Email');
    if (emailError) {
      errors.push(emailError);
    }

    // 驗證 username 長度
    const usernameError = this.validateMinLength(this.data.username, 3, 'Username');
    if (usernameError) {
      errors.push(usernameError);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  getFullName(): string {
    return `${this.data.firstName} ${this.data.lastName}`;
  }

  isAdmin(): boolean {
    return this.data.role === UserRole.Admin;
  }

  isActive(): boolean {
    return this.data.status === UserStatus.Active;
  }

  canLogin(): boolean {
    return this.isActive() && this.data.status !== UserStatus.Deleted;
  }

  updateLastLogin(): void {
    this.data.lastLoginAt = new Date();
  }
}
