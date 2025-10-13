/**
 * Validator Utils
 */

import { User } from '../types/user';
import { ValidationError, ValidationResult } from '../types/common';

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhone(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}

export function validatePassword(password: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (password.length < 8) {
    errors.push({
      field: 'password',
      message: 'Password must be at least 8 characters long'
    });
  }

  if (!/[A-Z]/.test(password)) {
    errors.push({
      field: 'password',
      message: 'Password must contain at least one uppercase letter'
    });
  }

  if (!/[a-z]/.test(password)) {
    errors.push({
      field: 'password',
      message: 'Password must contain at least one lowercase letter'
    });
  }

  if (!/[0-9]/.test(password)) {
    errors.push({
      field: 'password',
      message: 'Password must contain at least one number'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateUser(user: Partial<User>): ValidationResult {
  const errors: ValidationError[] = [];

  if (user.email && !validateEmail(user.email)) {
    errors.push({
      field: 'email',
      message: 'Invalid email format',
      value: user.email
    });
  }

  if (user.username && user.username.length < 3) {
    errors.push({
      field: 'username',
      message: 'Username must be at least 3 characters long',
      value: user.username
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
