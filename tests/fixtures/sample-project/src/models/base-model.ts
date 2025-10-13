/**
 * 抽象基底 Model 類別
 */

import { ID, ValidationResult, ValidationError } from '../types/common';

export abstract class BaseModel<T extends { id: ID }> {
  protected data: T;

  constructor(data: T) {
    this.data = data;
  }

  getId(): ID {
    return this.data.id;
  }

  getData(): T {
    return { ...this.data };
  }

  update(updates: Partial<T>): void {
    this.data = {
      ...this.data,
      ...updates
    };
  }

  abstract validate(): ValidationResult;

  protected validateRequired(field: keyof T, fieldName: string): ValidationError | null {
    const value = this.data[field];
    if (value === null || value === undefined || value === '') {
      return {
        field: fieldName,
        message: `${fieldName} is required`,
        value
      };
    }
    return null;
  }

  protected validateEmail(email: string, fieldName: string): ValidationError | null {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        field: fieldName,
        message: `${fieldName} must be a valid email address`,
        value: email
      };
    }
    return null;
  }

  protected validateMinLength(value: string, minLength: number, fieldName: string): ValidationError | null {
    if (value.length < minLength) {
      return {
        field: fieldName,
        message: `${fieldName} must be at least ${minLength} characters`,
        value
      };
    }
    return null;
  }

  toJSON(): T {
    return this.getData();
  }

  toString(): string {
    return JSON.stringify(this.data, null, 2);
  }
}
