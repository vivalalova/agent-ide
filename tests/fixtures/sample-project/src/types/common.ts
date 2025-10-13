/**
 * 共用型別定義
 */

export type ID = string;
export type Timestamp = number;

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface SearchCriteria {
  query: string;
  fields?: string[];
  caseSensitive?: boolean;
  exactMatch?: boolean;
}

export interface SortCriteria {
  field: string;
  order: 'asc' | 'desc';
}

export interface FilterCriteria {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like';
  value: unknown;
}

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;
