/**
 * Formatter Utils
 */

import { User } from '../types/user';
import { Product } from '../types/product';

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatDateTime(date: Date): string {
  return date.toISOString();
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
}

export function formatUser(user: User): string {
  return `${user.firstName} ${user.lastName} (${user.email})`;
}

export function formatProduct(product: Product): string {
  return `${product.name} - ${formatCurrency(product.price)} (SKU: ${product.sku})`;
}

export function formatPercentage(value: number, decimals: number = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}
